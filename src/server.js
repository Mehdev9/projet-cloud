require("dotenv").config({ quiet: true });

const express = require("express");
const path = require("path");
const config = require("./config");
const { createTaskStore, createBlobExportService } = require("./services/storageService");
const { createTaskRouter } = require("./routes/tasks");

async function bootstrap() {
  const app = express();
  const { taskStore, mode } = await createTaskStore();
  const blobService = createBlobExportService();

  app.set("view engine", "ejs");
  app.set("views", path.join(process.cwd(), "views"));

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(process.cwd(), "public")));

  app.get("/", async (req, res, next) => {
    try {
      const [tasks, exports] = await Promise.all([
        taskStore.listTasks(),
        blobService.listExports()
      ]);

      res.render("index", {
        title: config.appName,
        tasks,
        exports,
        status: {
          storageMode: mode,
          blobConfigured: Boolean(config.blob.connectionString)
        },
        message: req.query.info || "",
        error: req.query.error || ""
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(createTaskRouter(taskStore, blobService));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).render("index", {
      title: config.appName,
      tasks: [],
      exports: [],
      status: {
        storageMode: mode,
        blobConfigured: Boolean(config.blob.connectionString)
      },
      message: "",
      error: "Une erreur s'est produite pendant le traitement de la requete."
    });
  });

  app.listen(config.port, () => {
    console.log(`${config.appName} listening on port ${config.port}`);
    console.log(`Task storage mode: ${mode}`);
  });
}

bootstrap().catch((error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});
