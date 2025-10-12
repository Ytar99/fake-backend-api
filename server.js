import express from "express";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import open from "open";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3080;
const DB_FILE = "./database.sqlite";

app.use(express.json());

// Инициализация БД с использованием промисов для правильной последовательности
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log("Connected to SQLite database");
      resolve(db);
    });
  });
}

function createTables(db) {
  return new Promise((resolve, reject) => {
    // Создание таблиц последовательно
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT CHECK(LENGTH(name) <= 30) NOT NULL,
      username TEXT CHECK(LENGTH(username) <= 30) NOT NULL UNIQUE,
      email TEXT CHECK(LENGTH(email) <= 50) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT CHECK(LENGTH(phone) <= 20),
      website TEXT CHECK(LENGTH(website) <= 30),
      company TEXT NOT NULL
    )`,
      function (err) {
        if (err) {
          reject(err);
          return;
        }

        console.log("Users table created/verified");

        db.run(
          `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        title TEXT CHECK(LENGTH(title) <= 50) NOT NULL,
        body TEXT CHECK(LENGTH(body) <= 300) NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`,
          function (err) {
            if (err) {
              reject(err);
              return;
            }

            console.log("Posts table created/verified");
            resolve(db);
          }
        );
      }
    );
  });
}

function checkAndGenerateData(db) {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count === 0) {
        console.log("No users found, generating initial data...");
        generateInitialData(db)
          .then(() => {
            console.log("Initial data generation completed");
            resolve(db);
          })
          .catch(reject);
      } else {
        console.log(`Found ${row.count} existing users`);
        resolve(db);
      }
    });
  });
}

function generateInitialData(db) {
  return new Promise((resolve, reject) => {
    const users = [];
    for (let i = 0; i < 20; i++) {
      users.push({
        name: faker.person.fullName().substring(0, 30),
        username: faker.internet.userName().substring(0, 30),
        email: faker.internet.email().substring(0, 50),
        password: bcrypt.hashSync("password", 10),
        address: JSON.stringify({
          street: faker.location.street(),
          suite: faker.location.secondaryAddress(),
          city: faker.location.city(),
          zipcode: faker.location.zipCode(),
          geo: {
            lat: faker.location.latitude(),
            lng: faker.location.longitude(),
          },
        }),
        phone: faker.phone.number().substring(0, 20),
        website: faker.internet.domainName().substring(0, 30),
        company: JSON.stringify({
          name: faker.company.name(),
          catchPhrase: faker.company.catchPhrase(),
          bs: faker.company.buzzPhrase(),
        }),
      });
    }

    let usersProcessed = 0;
    let postsProcessed = 0;
    const totalUsers = users.length;
    let totalPosts = 0;

    function checkCompletion() {
      if (usersProcessed === totalUsers && postsProcessed === totalPosts) {
        resolve();
      }
    }

    users.forEach((user) => {
      db.run(
        `INSERT INTO users (name, username, email, password, address, phone, website, company) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.name, user.username, user.email, user.password, user.address, user.phone, user.website, user.company],
        function (err) {
          if (err) {
            console.error("Error inserting user:", err);
            usersProcessed++;
            checkCompletion();
            return;
          }

          const userId = this.lastID;
          usersProcessed++;

          // Создание постов для пользователя
          const posts = [];
          const postsCount = 1; // По 1 посту на пользователя для простоты
          for (let i = 0; i < postsCount; i++) {
            posts.push({
              userId: userId,
              title: faker.lorem.sentence().substring(0, 50),
              body: faker.lorem.paragraph().substring(0, 300),
            });
          }

          totalPosts += posts.length;

          posts.forEach((post) => {
            db.run(
              `INSERT INTO posts (userId, title, body) VALUES (?, ?, ?)`,
              [post.userId, post.title, post.body],
              function (err) {
                if (err) {
                  console.error("Error inserting post:", err);
                }
                postsProcessed++;
                checkCompletion();
              }
            );
          });
        }
      );
    });
  });
}

// Глобальная переменная для базы данных
let db;

// Инициализация при запуске
initializeDatabase()
  .then((database) => {
    db = database;
    return createTables(db);
  })
  .then((db) => checkAndGenerateData(db))
  .then(() => {
    console.log("Database initialization completed successfully");
    startServer();
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

function startServer() {
  // Мидлварь для обработки ошибок БД
  function handleDbError(res, err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Internal server error" });
  }

  // Вспомогательная функция для получения пользователя с парсингом JSON полей
  function parseUser(user) {
    if (!user) return null;

    const { password, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      address: JSON.parse(user.address),
      company: JSON.parse(user.company),
    };
  }

  app.get("/", (req, res) => {
    res.sendFile("./index.html", { root: path.resolve() });
  });

  // Эндпоинты аутентификации
  app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err) return handleDbError(res, err);
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      res.json(parseUser(user));
    });
  });

  app.post("/register", (req, res) => {
    const { name, username, email, password, address, phone, website, company } = req.body;

    // Валидация обязательных полей
    if (!name || !username || !email || !password) {
      return res.status(400).json({
        error: "Name, username, email and password are required",
      });
    }

    // Валидация длин
    const validations = [
      { field: "name", value: name, max: 30, required: true },
      { field: "username", value: username, max: 30, required: true },
      { field: "email", value: email, max: 50, required: true },
      { field: "phone", value: phone, max: 20, required: false },
      { field: "website", value: website, max: 30, required: false },
    ];

    for (let { field, value, max, required } of validations) {
      if (required && !value) {
        return res.status(400).json({
          error: `${field} is required`,
        });
      }
      if (value && value.length > max) {
        return res.status(400).json({
          error: `${field} must be less than ${max} characters`,
        });
      }
    }

    // Хэширование пароля
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(
      `INSERT INTO users (name, username, email, password, address, phone, website, company) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        username,
        email,
        hashedPassword,
        JSON.stringify(address || {}),
        phone || "",
        website || "",
        JSON.stringify(company || {}),
      ],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE constraint failed")) {
            return res.status(400).json({ error: "User with this email or username already exists" });
          }
          return handleDbError(res, err);
        }

        // Возвращаем созданного пользователя
        db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => {
          if (err) return handleDbError(res, err);
          res.status(201).json(parseUser(user));
        });
      }
    );
  });

  // CRUD для постов
  app.get("/posts", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    db.all(
      `
      SELECT posts.*, 
             json_object(
               'id', users.id,
               'name', users.name,
               'username', users.username,
               'email', users.email,
               'address', users.address,
               'phone', users.phone,
               'website', users.website,
               'company', users.company
             ) as user
      FROM posts 
      INNER JOIN users ON posts.userId = users.id
      LIMIT ? OFFSET ?
    `,
      [limit, offset],
      (err, rows) => {
        if (err) return handleDbError(res, err);

        const posts = rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          title: row.title,
          body: row.body,
          user: JSON.parse(row.user),
        }));

        res.json(posts);
      }
    );
  });

  app.post("/posts", (req, res) => {
    const { title, body, userId } = req.body;

    if (!title || title.length > 50) {
      return res.status(400).json({
        error: "Title is required and must be less than 50 characters",
      });
    }
    if (!body || body.length > 300) {
      return res.status(400).json({
        error: "Body is required and must be less than 300 characters",
      });
    }
    if (!userId) {
      return res.status(400).json({
        error: "userId is required",
      });
    }

    // Проверяем существование пользователя
    db.get("SELECT id FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) return handleDbError(res, err);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }

      db.run("INSERT INTO posts (title, body, userId) VALUES (?, ?, ?)", [title, body, userId], function (err) {
        if (err) return handleDbError(res, err);

        // Возвращаем созданный пост с информацией о пользователе
        db.get(
          `
            SELECT posts.*,
                   json_object(
                     'id', users.id,
                     'name', users.name,
                     'username', users.username,
                     'email', users.email,
                     'address', users.address,
                     'phone', users.phone,
                     'website', users.website,
                     'company', users.company
                   ) as user
            FROM posts 
            INNER JOIN users ON posts.userId = users.id
            WHERE posts.id = ?
          `,
          [this.lastID],
          (err, row) => {
            if (err) return handleDbError(res, err);
            res.status(201).json({
              id: row.id,
              userId: row.userId,
              title: row.title,
              body: row.body,
              user: JSON.parse(row.user),
            });
          }
        );
      });
    });
  });

  app.get("/posts/:id", (req, res) => {
    const { id } = req.params;

    db.get(
      `
      SELECT posts.*,
             json_object(
               'id', users.id,
               'name', users.name,
               'username', users.username,
               'email', users.email,
               'address', users.address,
               'phone', users.phone,
               'website', users.website,
               'company', users.company
             ) as user
      FROM posts 
      INNER JOIN users ON posts.userId = users.id
      WHERE posts.id = ?
    `,
      [id],
      (err, row) => {
        if (err) return handleDbError(res, err);
        if (!row) {
          return res.status(404).json({ error: "Post not found" });
        }

        res.json({
          id: row.id,
          userId: row.userId,
          title: row.title,
          body: row.body,
          user: JSON.parse(row.user),
        });
      }
    );
  });

  app.put("/posts/:id", (req, res) => {
    const { id } = req.params;
    const { title, body, userId } = req.body;

    // Валидация
    if (title && title.length > 50) {
      return res.status(400).json({
        error: "Title must be less than 50 characters",
      });
    }
    if (body && body.length > 300) {
      return res.status(400).json({
        error: "Body must be less than 300 characters",
      });
    }

    // Проверяем существование поста
    db.get("SELECT * FROM posts WHERE id = ?", [id], (err, post) => {
      if (err) return handleDbError(res, err);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      // Если указан userId, проверяем существование пользователя
      if (userId) {
        db.get("SELECT id FROM users WHERE id = ?", [userId], (err, user) => {
          if (err) return handleDbError(res, err);
          if (!user) {
            return res.status(400).json({ error: "User not found" });
          }
          updatePost();
        });
      } else {
        updatePost();
      }
    });

    function updatePost() {
      const updates = [];
      const values = [];

      if (title !== undefined) {
        updates.push("title = ?");
        values.push(title);
      }
      if (body !== undefined) {
        updates.push("body = ?");
        values.push(body);
      }
      if (userId !== undefined) {
        updates.push("userId = ?");
        values.push(userId);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);

      db.run(`UPDATE posts SET ${updates.join(", ")} WHERE id = ?`, values, function (err) {
        if (err) return handleDbError(res, err);

        // Возвращаем обновленный пост
        db.get(
          `
            SELECT posts.*,
                   json_object(
                     'id', users.id,
                     'name', users.name,
                     'username', users.username,
                     'email', users.email,
                     'address', users.address,
                     'phone', users.phone,
                     'website', users.website,
                     'company', users.company
                   ) as user
            FROM posts 
            INNER JOIN users ON posts.userId = users.id
            WHERE posts.id = ?
          `,
          [id],
          (err, row) => {
            if (err) return handleDbError(res, err);
            res.json({
              id: row.id,
              userId: row.userId,
              title: row.title,
              body: row.body,
              user: JSON.parse(row.user),
            });
          }
        );
      });
    }
  });

  app.delete("/posts/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM posts WHERE id = ?", [id], (err, post) => {
      if (err) return handleDbError(res, err);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      db.run("DELETE FROM posts WHERE id = ?", [id], function (err) {
        if (err) return handleDbError(res, err);
        res.status(204).send();
      });
    });
  });

  // CRUD для пользователей
  app.get("/users", (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    db.all(
      `
      SELECT * FROM users 
      LIMIT ? OFFSET ?
    `,
      [limit, offset],
      (err, rows) => {
        if (err) return handleDbError(res, err);

        const users = rows.map((user) => parseUser(user));
        res.json(users);
      }
    );
  });

  app.post("/users", (req, res) => {
    const { name, username, email, password, address, phone, website, company } = req.body;

    // Валидация (аналогично регистрации)
    if (!name || !username || !email || !password) {
      return res.status(400).json({
        error: "Name, username, email and password are required",
      });
    }

    const validations = [
      { field: "name", value: name, max: 30, required: true },
      { field: "username", value: username, max: 30, required: true },
      { field: "email", value: email, max: 50, required: true },
      { field: "phone", value: phone, max: 20, required: false },
      { field: "website", value: website, max: 30, required: false },
    ];

    for (let { field, value, max, required } of validations) {
      if (required && !value) {
        return res.status(400).json({
          error: `${field} is required`,
        });
      }
      if (value && value.length > max) {
        return res.status(400).json({
          error: `${field} must be less than ${max} characters`,
        });
      }
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(
      `INSERT INTO users (name, username, email, password, address, phone, website, company) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        username,
        email,
        hashedPassword,
        JSON.stringify(address || {}),
        phone || "",
        website || "",
        JSON.stringify(company || {}),
      ],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE constraint failed")) {
            return res.status(400).json({ error: "User with this email or username already exists" });
          }
          return handleDbError(res, err);
        }

        db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => {
          if (err) return handleDbError(res, err);
          res.status(201).json(parseUser(user));
        });
      }
    );
  });

  app.get("/users/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
      if (err) return handleDbError(res, err);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(parseUser(user));
    });
  });

  app.put("/users/:id", (req, res) => {
    const { id } = req.params;
    const { name, username, email, address, phone, website, company } = req.body;

    // Валидация
    const validations = [
      { field: "name", value: name, max: 30 },
      { field: "username", value: username, max: 30 },
      { field: "email", value: email, max: 50 },
      { field: "phone", value: phone, max: 20 },
      { field: "website", value: website, max: 30 },
    ];

    for (let { field, value, max } of validations) {
      if (value && value.length > max) {
        return res.status(400).json({
          error: `${field} must be less than ${max} characters`,
        });
      }
    }

    // Проверяем существование пользователя
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
      if (err) return handleDbError(res, err);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push("name = ?");
        values.push(name);
      }
      if (username !== undefined) {
        updates.push("username = ?");
        values.push(username);
      }
      if (email !== undefined) {
        updates.push("email = ?");
        values.push(email);
      }
      if (address !== undefined) {
        updates.push("address = ?");
        values.push(JSON.stringify(address));
      }
      if (phone !== undefined) {
        updates.push("phone = ?");
        values.push(phone);
      }
      if (website !== undefined) {
        updates.push("website = ?");
        values.push(website);
      }
      if (company !== undefined) {
        updates.push("company = ?");
        values.push(JSON.stringify(company));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(id);

      db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values, function (err) {
        if (err) {
          if (err.message.includes("UNIQUE constraint failed")) {
            return res.status(400).json({ error: "User with this email or username already exists" });
          }
          return handleDbError(res, err);
        }

        // Возвращаем обновленного пользователя
        db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
          if (err) return handleDbError(res, err);
          res.json(parseUser(user));
        });
      });
    });
  });

  app.delete("/users/:id", (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
      if (err) return handleDbError(res, err);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Сначала удаляем посты пользователя
      db.run("DELETE FROM posts WHERE userId = ?", [id], (err) => {
        if (err) return handleDbError(res, err);

        // Затем удаляем пользователя
        db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
          if (err) return handleDbError(res, err);
          res.status(204).send();
        });
      });
    });
  });

  // Обработка несуществующих маршрутов
  app.use("*", (req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Обработка ошибок
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // Запуск сервера
  app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);

    try {
      await open(`http://localhost:${PORT}`);
      console.log("Браузер автоматически открыт с документацией API");
    } catch (error) {
      console.log("Не удалось автоматически открыть браузер:", error.message);
      console.log(`Пожалуйста, откройте браузер вручную по адресу: http://localhost:${PORT}`);
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
      process.exit(0);
    });
  });
}
