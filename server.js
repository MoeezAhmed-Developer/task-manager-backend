import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3200;
const client = new MongoClient(process.env.MONGODB_URI);
const dbName = process.env.DB_NAME;

app.use(cors());
app.use(express.json());

let tasks;

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

app.get("/", (req, res) => {
  res.json({ message: "Ok" });
});

app.get("/api/tasks", async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    const filter = {};

    if (status && status !== "all") filter.status = status;
    if (priority && priority !== "all") filter.priority = priority;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const data = await tasks.find(filter).sort({ createdAt: -1 }).toArray();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to load tasks." });
  }
});

app.get("/api/tasks/:id", async (req, res) => {
  try {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "Invalid task ID." });

    const task = await tasks.findOne({ _id: new ObjectId(req.params.id) });
    if (!task) return res.status(404).json({ message: "Task not found." });

    res.json(task);
  } catch {
    res.status(500).json({ message: "Failed to load task." });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const task = normalizeTask(req.body);

    if (!task.title) {
      return res.status(400).json({ message: "Task title is required." });
    }

    const now = new Date();
    const document = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    const result = await tasks.insertOne(document);
    const created = await tasks.findOne({ _id: result.insertedId });

    res.status(201).json(created);
  } catch {
    res.status(500).json({ message: "Failed to create task." });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "Invalid task ID." });

    const task = normalizeTask(req.body);

    if (!task.title) {
      return res.status(400).json({ message: "Task title is required." });
    }

    const result = await tasks.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: task },
      { returnDocument: "after" },
    );

    if (!result) return res.status(404).json({ message: "Task not found." });

    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to update task." });
  }
});

app.patch("/api/tasks/:id/status", async (req, res) => {
  try {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "Invalid task ID." });

    const status = req.body.status;

    if (!["todo", "in-progress", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const result = await tasks.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!result) return res.status(404).json({ message: "Task not found." });

    res.json(result);
  } catch {
    res.status(500).json({ message: "Failed to update status." });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "Invalid task ID." });

    const result = await tasks.deleteOne({ _id: new ObjectId(req.params.id) });

    if (!result.deletedCount) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({ message: "Task deleted successfully." });
  } catch {
    res.status(500).json({ message: "Failed to delete task." });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const [total, todo, inProgress, completed] = await Promise.all([
      tasks.countDocuments(),
      tasks.countDocuments({ status: "todo" }),
      tasks.countDocuments({ status: "in-progress" }),
      tasks.countDocuments({ status: "completed" }),
    ]);

    res.json({ total, todo, inProgress, completed });
  } catch {
    res.status(500).json({ message: "Failed to load statistics." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  try {
    await client.connect();
    const db = client.db(dbName);
    tasks = db.collection("tasks");

    await tasks.createIndex({ status: 1 });
    await tasks.createIndex({ priority: 1 });
    await tasks.createIndex({ createdAt: -1 });

    app.listen(PORT, () => {
      console.log(`Task API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

startServer();
