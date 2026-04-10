const express = require("express");

function createTaskRouter(taskStore, blobService) {
  const router = express.Router();

  router.post("/tasks", async (req, res, next) => {
    try {
      const title = String(req.body.title || "").trim();
      if (!title) {
        return res.redirect("/?error=Veuillez+indiquer+une+tache");
      }

      await taskStore.createTask(title);
      return res.redirect("/");
    } catch (error) {
      return next(error);
    }
  });

  router.post("/tasks/:id/toggle", async (req, res, next) => {
    try {
      await taskStore.toggleTask(req.params.id);
      return res.redirect("/");
    } catch (error) {
      return next(error);
    }
  });

  router.post("/tasks/:id/delete", async (req, res, next) => {
    try {
      await taskStore.deleteTask(req.params.id);
      return res.redirect("/");
    } catch (error) {
      return next(error);
    }
  });

  router.post("/exports", async (req, res, next) => {
    try {
      const exportBuffer = await taskStore.exportTasks();
      const result = await blobService.uploadJsonExport(exportBuffer);

      if (!result) {
        return res.redirect("/?info=Blob+Storage+non+configure");
      }

      return res.redirect(`/?info=Export+cree:+${encodeURIComponent(result.blobName)}`);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createTaskRouter
};
