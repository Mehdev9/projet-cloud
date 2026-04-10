const path = require("path");

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  env: process.env.NODE_ENV || "development",
  appName: process.env.APP_NAME || "Azure TODO",
  useFileStorage: toBoolean(process.env.USE_FILE_STORAGE, true),
  dataFilePath: path.join(process.cwd(), "data", "tasks.json"),
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT || "",
    key: process.env.COSMOS_KEY || "",
    database: process.env.COSMOS_DATABASE || "todo-app-db",
    container: process.env.COSMOS_CONTAINER || "tasks",
    partitionKey: process.env.COSMOS_PARTITION_KEY || "/id"
  },
  keyVault: {
    url: process.env.KEY_VAULT_URL || "",
    cosmosKeySecretName: process.env.COSMOS_KEY_SECRET_NAME || ""
  },
  blob: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || "",
    containerName: process.env.BLOB_CONTAINER_NAME || "exports"
  }
};
