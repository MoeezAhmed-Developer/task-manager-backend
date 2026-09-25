import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const dbName = process.env.DB_NAME;

let tasks;
let dbPromise;

async function connectDB() {
  if (tasks) {
    return tasks;
  }

  if (!dbPromise) {
    dbPromise = client
      .connect()
      .then(() => {
        const db = client.db(dbName);
        tasks = db.collection("tasks");

        return tasks
          .createIndex({ status: 1 })
          .then(() => tasks.createIndex({ priority: 1 }))
          .then(() => tasks.createIndex({ createdAt: -1 }))
          .then(() => tasks);
      })
      .catch((error) => {
        dbPromise = null;
        console.error("MongoDB connection failed:", error);
        throw error;
      });
  }

  return dbPromise;
}

function validId(id) {
  return ObjectId.isValid(id);
}

function normalizeTask(body) {
  return {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    priority: ["low", "medium", "high"].includes(body.priority)
      ? body.priority
      : "medium",
    status: ["todo", "in-progress", "completed"].includes(body.status)
      ? body.status
      : "todo",
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    updatedAt: new Date(),
  };
}

/* ---------------- HOME ---------------- */

app.get("/", (req, res) => {
  res.json({
    message: "Task API is running successfully.",
  });
});

/* ---------------- HEALTH ---------------- */

app.get("/api/health", async (req, res) => {
  try {
    await connectDB();

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

/* ---------------- GET ALL TASKS ---------------- */

app.get("/api/tasks", async (req, res) => {
  try {
    await connectDB();

    const { status, priority, search } = req.query;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (search) {
      filter.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          description: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const data = await tasks.find(filter).sort({ createdAt: -1 }).toArray();

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load tasks.",
    });
  }
});

/* ---------------- GET SINGLE TASK ---------------- */

app.get("/api/tasks/:id", async (req, res) => {
  try {
    await connectDB();

    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    const task = await tasks.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json(task);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load task.",
    });
  }
});

/* ---------------- CREATE TASK ---------------- */

app.post("/api/tasks", async (req, res) => {
  try {
    await connectDB();

    const task = normalizeTask(req.body);

    if (!task.title) {
      return res.status(400).json({
        message: "Task title is required.",
      });
    }

    const now = new Date();

    const document = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    const result = await tasks.insertOne(document);

    const created = await tasks.findOne({
      _id: result.insertedId,
    });

    res.status(201).json(created);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create task.",
    });
  }
});

/* ---------------- UPDATE TASK ---------------- */

app.put("/api/tasks/:id", async (req, res) => {
  try {
    await connectDB();

    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    const task = normalizeTask(req.body);

    if (!task.title) {
      return res.status(400).json({
        message: "Task title is required.",
      });
    }

    const result = await tasks.findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: task,
      },
      {
        returnDocument: "after",
      },
    );

    if (!result) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update task.",
    });
  }
});

/* ---------------- UPDATE STATUS ---------------- */

app.patch("/api/tasks/:id/status", async (req, res) => {
  try {
    await connectDB();

    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    const status = req.body.status;

    if (!["todo", "in-progress", "completed"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status.",
      });
    }

    const result = await tasks.findOneAndUpdate(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!result) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update status.",
    });
  }
});

/* ---------------- DELETE TASK ---------------- */

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await connectDB();

    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    const result = await tasks.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    res.json({
      message: "Task deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to delete task.",
    });
  }
});

/* ---------------- STATS ---------------- */

app.get("/api/stats", async (req, res) => {
  try {
    await connectDB();

    const [total, todo, inProgress, completed] = await Promise.all([
      tasks.countDocuments(),
      tasks.countDocuments({
        status: "todo",
      }),
      tasks.countDocuments({
        status: "in-progress",
      }),
      tasks.countDocuments({
        status: "completed",
      }),
    ]);

    res.json({
      total,
      todo,
      inProgress,
      completed,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load statistics.",
    });
  }
});

export default app;
