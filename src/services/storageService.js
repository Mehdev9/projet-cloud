const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const config = require("../config");
const { getSecret } = require("./keyVaultService");

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

class FileTaskStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readTasks() {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        await ensureDir(this.filePath);
        await fs.writeFile(this.filePath, "[]", "utf8");
        return [];
      }

      throw error;
    }
  }

  async saveTasks(tasks) {
    await ensureDir(this.filePath);
    await fs.writeFile(this.filePath, JSON.stringify(tasks, null, 2), "utf8");
  }

  async listTasks() {
    const tasks = await this.readTasks();
    return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async createTask(title) {
    const tasks = await this.readTasks();
    const task = {
      id: randomUUID(),
      title,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    tasks.push(task);
    await this.saveTasks(tasks);
    return task;
  }

  async toggleTask(id) {
    const tasks = await this.readTasks();
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      return null;
    }

    task.status = task.status === "done" ? "pending" : "done";
    task.updatedAt = new Date().toISOString();
    await this.saveTasks(tasks);
    return task;
  }

  async deleteTask(id) {
    const tasks = await this.readTasks();
    const remaining = tasks.filter((item) => item.id !== id);
    await this.saveTasks(remaining);
  }

  async exportTasks() {
    const tasks = await this.listTasks();
    return Buffer.from(JSON.stringify(tasks, null, 2), "utf8");
  }
}

class CosmosTaskStore {
  constructor(container) {
    this.container = container;
  }

  async listTasks() {
    const querySpec = {
      query: "SELECT * FROM c ORDER BY c.createdAt DESC"
    };
    const { resources } = await this.container.items.query(querySpec).fetchAll();
    return resources;
  }

  async createTask(title) {
    const task = {
      id: randomUUID(),
      title,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const { resource } = await this.container.items.create(task);
    return resource;
  }

  async toggleTask(id) {
    const task = await this.findTask(id);
    if (!task) {
      return null;
    }

    const updated = {
      ...task,
      status: task.status === "done" ? "pending" : "done",
      updatedAt: new Date().toISOString()
    };

    const { resource } = await this.container.item(task.id, task.id).replace(updated);
    return resource;
  }

  async deleteTask(id) {
    const task = await this.findTask(id);
    if (!task) {
      return;
    }

    await this.container.item(task.id, task.id).delete();
  }

  async exportTasks() {
    const tasks = await this.listTasks();
    return Buffer.from(JSON.stringify(tasks, null, 2), "utf8");
  }

  async findTask(id) {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: id }]
    };
    const { resources } = await this.container.items.query(querySpec).fetchAll();
    return resources[0] || null;
  }
}

class BlobExportService {
  constructor(blobClient, containerName) {
    this.blobClient = blobClient;
    this.containerName = containerName;
  }

  async uploadJsonExport(content) {
    if (!this.blobClient) {
      return null;
    }

    const containerClient = this.blobClient.getContainerClient(this.containerName);
    await containerClient.createIfNotExists();

    const blobName = `tasks-export-${Date.now()}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(content, {
      blobHTTPHeaders: {
        blobContentType: "application/json"
      }
    });

    return {
      blobName,
      url: blockBlobClient.url
    };
  }

  async listExports() {
    if (!this.blobClient) {
      return [];
    }

    const containerClient = this.blobClient.getContainerClient(this.containerName);
    const blobs = [];

    try {
      for await (const blob of containerClient.listBlobsFlat()) {
        blobs.push({
          name: blob.name,
          url: `${containerClient.url}/${blob.name}`,
          lastModified: blob.properties.lastModified
        });
      }
    } catch (error) {
      if (error.statusCode === 404) {
        return [];
      }

      throw error;
    }

    return blobs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  }
}

async function createTaskStore() {
  if (config.useFileStorage) {
    return {
      taskStore: new FileTaskStore(config.dataFilePath),
      mode: "file"
    };
  }

  let cosmosKey = config.cosmos.key;
  if (!cosmosKey && config.keyVault.url && config.keyVault.cosmosKeySecretName) {
    cosmosKey = await getSecret(config.keyVault.url, config.keyVault.cosmosKeySecretName);
  }

  if (!config.cosmos.endpoint || !cosmosKey) {
    throw new Error("Cosmos DB is not configured. Define COSMOS_ENDPOINT and COSMOS_KEY or use Key Vault.");
  }

  const client = new CosmosClient({
    endpoint: config.cosmos.endpoint,
    key: cosmosKey
  });

  const { database } = await client.databases.createIfNotExists({
    id: config.cosmos.database
  });

  const { container } = await database.containers.createIfNotExists({
    id: config.cosmos.container,
    partitionKey: {
      paths: [config.cosmos.partitionKey],
      kind: "Hash"
    }
  });

  return {
    taskStore: new CosmosTaskStore(container),
    mode: "cosmos"
  };
}

function createBlobExportService() {
  if (!config.blob.connectionString) {
    return new BlobExportService(null, config.blob.containerName);
  }

  const blobClient = BlobServiceClient.fromConnectionString(config.blob.connectionString);
  return new BlobExportService(blobClient, config.blob.containerName);
}

module.exports = {
  createTaskStore,
  createBlobExportService
};
