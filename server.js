import express from "express";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import open from "open";

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

  // Добавьте этот код в секцию с эндпоинтами (перед CRUD операциями)

  app.get("/", (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSONPlaceholder Clone API Documentation</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
            padding: 40px 0;
        }
        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        .card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .card h2 {
            color: #4a5568;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .card h2 i {
            color: #667eea;
        }
        .endpoint {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .endpoint:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .method {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            font-size: 0.9rem;
            margin-right: 10px;
        }
        .method.get { background: #48bb78; }
        .method.post { background: #4299e1; }
        .method.put { background: #ed8936; }
        .method.delete { background: #f56565; }
        .path {
            font-family: 'Courier New', monospace;
            font-weight: bold;
            color: #2d3748;
        }
        .description {
            margin: 10px 0;
            color: #4a5568;
        }
        .params {
            background: #edf2f7;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
        }
        .params h4 {
            margin-bottom: 8px;
            color: #2d3748;
        }
        .param {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .param:last-child {
            border-bottom: none;
        }
        .param-name {
            font-family: 'Courier New', monospace;
            font-weight: bold;
            color: #2d3748;
        }
        .param-type {
            color: #718096;
            font-style: italic;
        }
        .param-desc {
            color: #4a5568;
            flex-grow: 1;
            margin: 0 15px;
        }
        .example {
            background: #1a202c;
            color: #cbd5e0;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .example-title {
            color: #e2e8f0;
            margin-bottom: 10px;
            font-weight: bold;
        }
        .code-key { color: #63b3ed; }
        .code-string { color: #68d391; }
        .code-number { color: #fbb6ce; }
        .code-boolean { color: #f6ad55; }
        .footer {
            text-align: center;
            color: white;
            margin-top: 40px;
            padding: 20px;
            opacity: 0.8;
        }
        .tab {
            padding-left: 20px;
        }
        .double-tab {
            padding-left: 40px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 JSONPlaceholder Clone API</h1>
            <p>Полнофункциональный REST API для тестирования ваших приложений</p>
        </div>

        <div class="card">
            <h2>📚 Общая информация</h2>
            <p>Базовый URL: <strong>http://localhost:${PORT}</strong></p>
            <p>Все ответы возвращаются в формате JSON</p>
            <p>Для работы с приватными эндпоинтами требуется аутентификация</p>
        </div>

        <div class="card">
            <h2>🔐 Аутентификация</h2>
            
            <div class="endpoint">
                <div>
                    <span class="method post">POST</span>
                    <span class="path">/login</span>
                </div>
                <div class="description">Вход в систему</div>
                <div class="params">
                    <h4>Параметры тела запроса:</h4>
                    <div class="param">
                        <span class="param-name">email</span>
                        <span class="param-desc">Email пользователя</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">password</span>
                        <span class="param-desc">Пароль пользователя</span>
                        <span class="param-type">string</span>
                    </div>
                </div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function login() {
  const response = await fetch('http://localhost:${PORT}/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      <span class="code-key">email</span>: <span class="code-string">'user@example.com'</span>,
      <span class="code-key">password</span>: <span class="code-string">'password123'</span>
    })
  });
  
  if (response.ok) {
    const user = await response.json();
    console.log('Logged in:', user);
    localStorage.setItem('token', user.id); // Сохраняем ID пользователя
  } else {
    console.error('Login failed');
  }
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method post">POST</span>
                    <span class="path">/register</span>
                </div>
                <div class="description">Регистрация нового пользователя</div>
                <div class="params">
                    <h4>Параметры тела запроса:</h4>
                    <div class="param">
                        <span class="param-name">name</span>
                        <span class="param-desc">Полное имя (макс. 30 символов)</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">username</span>
                        <span class="param-desc">Имя пользователя (макс. 30 символов)</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">email</span>
                        <span class="param-desc">Email (макс. 50 символов)</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">password</span>
                        <span class="param-desc">Пароль</span>
                        <span class="param-type">string</span>
                    </div>
                </div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function register() {
  const response = await fetch('http://localhost:${PORT}/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      <span class="code-key">name</span>: <span class="code-string">'John Doe'</span>,
      <span class="code-key">username</span>: <span class="code-string">'johndoe'</span>,
      <span class="code-key">email</span>: <span class="code-string">'john@example.com'</span>,
      <span class="code-key">password</span>: <span class="code-string">'password123'</span>,
      <span class="code-key">address</span>: {
        <span class="tab"><span class="code-key">street</span>: <span class="code-string">'123 Main St'</span>,</span>
        <span class="tab"><span class="code-key">city</span>: <span class="code-string">'New York'</span></span>
      }
    })
  });
  
  const result = await response.json();
  if (response.ok) {
    console.log('Registered:', result);
  } else {
    console.error('Registration failed:', result.error);
  }
}
</pre>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>📝 Посты (Posts)</h2>
            
            <div class="endpoint">
                <div>
                    <span class="method get">GET</span>
                    <span class="path">/posts</span>
                </div>
                <div class="description">Получить список постов с пагинацией</div>
                <div class="params">
                    <h4>Query параметры:</h4>
                    <div class="param">
                        <span class="param-name">page</span>
                        <span class="param-desc">Номер страницы (по умолчанию: 1)</span>
                        <span class="param-type">number</span>
                    </div>
                    <div class="param">
                        <span class="param-name">limit</span>
                        <span class="param-desc">Количество постов на странице (по умолчанию: 10)</span>
                        <span class="param-type">number</span>
                    </div>
                </div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function getPosts() {
  const response = await fetch('http://localhost:${PORT}/posts?page=1&limit=5');
  const posts = await response.json();
  console.log('Posts:', posts);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method post">POST</span>
                    <span class="path">/posts</span>
                </div>
                <div class="description">Создать новый пост</div>
                <div class="params">
                    <h4>Параметры тела запроса:</h4>
                    <div class="param">
                        <span class="param-name">title</span>
                        <span class="param-desc">Заголовок поста (макс. 50 символов)</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">body</span>
                        <span class="param-desc">Текст поста (макс. 300 символов)</span>
                        <span class="param-type">string</span>
                    </div>
                    <div class="param">
                        <span class="param-name">userId</span>
                        <span class="param-desc">ID пользователя</span>
                        <span class="param-type">number</span>
                    </div>
                </div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function createPost() {
  const response = await fetch('http://localhost:${PORT}/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      <span class="code-key">title</span>: <span class="code-string">'Мой первый пост'</span>,
      <span class="code-key">body</span>: <span class="code-string">'Это содержание моего первого поста...'</span>,
      <span class="code-key">userId</span>: <span class="code-number">1</span>
    })
  });
  
  const newPost = await response.json();
  console.log('Created post:', newPost);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method get">GET</span>
                    <span class="path">/posts/:id</span>
                </div>
                <div class="description">Получить пост по ID</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function getPost() {
  const response = await fetch('http://localhost:${PORT}/posts/1');
  const post = await response.json();
  console.log('Post:', post);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method put">PUT</span>
                    <span class="path">/posts/:id</span>
                </div>
                <div class="description">Обновить пост</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function updatePost() {
  const response = await fetch('http://localhost:${PORT}/posts/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      <span class="code-key">title</span>: <span class="code-string">'Обновленный заголовок'</span>,
      <span class="code-key">body</span>: <span class="code-string">'Обновленное содержание...'</span>
    })
  });
  
  const updatedPost = await response.json();
  console.log('Updated post:', updatedPost);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method delete">DELETE</span>
                    <span class="path">/posts/:id</span>
                </div>
                <div class="description">Удалить пост</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function deletePost() {
  const response = await fetch('http://localhost:${PORT}/posts/1', {
    method: 'DELETE'
  });
  
  if (response.status === 204) {
    console.log('Post deleted successfully');
  }
}
</pre>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>👥 Пользователи (Users)</h2>
            
            <div class="endpoint">
                <div>
                    <span class="method get">GET</span>
                    <span class="path">/users</span>
                </div>
                <div class="description">Получить список пользователей с пагинацией</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function getUsers() {
  const response = await fetch('http://localhost:${PORT}/users?page=1&limit=10');
  const users = await response.json();
  console.log('Users:', users);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method get">GET</span>
                    <span class="path">/users/:id</span>
                </div>
                <div class="description">Получить пользователя по ID</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function getUser() {
  const response = await fetch('http://localhost:${PORT}/users/1');
  const user = await response.json();
  console.log('User:', user);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method put">PUT</span>
                    <span class="path">/users/:id</span>
                </div>
                <div class="description">Обновить пользователя</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function updateUser() {
  const response = await fetch('http://localhost:${PORT}/users/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      <span class="code-key">name</span>: <span class="code-string">'Новое имя'</span>,
      <span class="code-key">email</span>: <span class="code-string">'new@email.com'</span>
    })
  });
  
  const updatedUser = await response.json();
  console.log('Updated user:', updatedUser);
}
</pre>
                </div>
            </div>

            <div class="endpoint">
                <div>
                    <span class="method delete">DELETE</span>
                    <span class="path">/users/:id</span>
                </div>
                <div class="description">Удалить пользователя</div>
                <div class="example">
                    <div class="example-title">Пример использования (JavaScript):</div>
<pre>
async function deleteUser() {
  const response = await fetch('http://localhost:${PORT}/users/1', {
    method: 'DELETE'
  });
  
  if (response.status === 204) {
    console.log('User deleted successfully');
  }
}
</pre>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>🛠 Утилиты</h2>
            <div class="example">
                <div class="example-title">Полный пример приложения (JavaScript):</div>
<pre>
class ApiClient {
  <span class="code-key">constructor</span>(baseUrl) {
    <span class="code-key">this</span>.baseUrl = baseUrl;
  }

  <span class="code-key">async</span> <span class="code-key">request</span>(endpoint, options = {}) {
    <span class="code-key">const</span> response = <span class="code-key">await</span> fetch(<span class="code-key">this</span>.baseUrl + endpoint, {
      headers: {
        <span class="code-string">'Content-Type'</span>: <span class="code-string">'application/json'</span>,
        ...options.headers
      },
      ...options
    });

    <span class="code-key">if</span> (response.status === 204) {
      <span class="code-key">return</span> null;
    }

    <span class="code-key">const</span> data = <span class="code-key">await</span> response.json();

    <span class="code-key">if</span> (!response.ok) {
      <span class="code-key">throw new</span> Error(data.error || <span class="code-string">'Request failed'</span>);
    }

    <span class="code-key">return</span> data;
  }

  <span class="code-key">async</span> <span class="code-key">getPosts</span>(page = 1, limit = 10) {
    <span class="code-key">return this</span>.request(<span class="code-string">\`/posts?page=\${page}&limit=\${limit}\`</span>);
  }

  <span class="code-key">async</span> <span class="code-key">createPost</span>(postData) {
    <span class="code-key">return this</span>.request(<span class="code-string">'/posts'</span>, {
      method: <span class="code-string">'POST'</span>,
      body: JSON.stringify(postData)
    });
  }

  <span class="code-key">async</span> <span class="code-key">login</span>(email, password) {
    <span class="code-key">return this</span>.request(<span class="code-string">'/login'</span>, {
      method: <span class="code-string">'POST'</span>,
      body: JSON.stringify({ email, password })
    });
  }
}

<span class="code-key">const</span> api = <span class="code-key">new</span> ApiClient(<span class="code-string">'http://localhost:${PORT}'</span>);

<span class="code-key">async</span> <span class="code-key">function</span> exampleUsage() {
  <span class="code-key">try</span> {
    <span class="code-comment">// Логин</span>
    <span class="code-key">const</span> user = <span class="code-key">await</span> api.login(<span class="code-string">'user@example.com'</span>, <span class="code-string">'password'</span>);
    console.log(<span class="code-string">'Logged in:'</span>, user);

    <span class="code-comment">// Получить посты</span>
    <span class="code-key">const</span> posts = <span class="code-key">await</span> api.getPosts(1, 5);
    console.log(<span class="code-string">'Posts:'</span>, posts);

    <span class="code-comment">// Создать пост</span>
    <span class="code-key">const</span> newPost = <span class="code-key">await</span> api.createPost({
      title: <span class="code-string">'Новый пост'</span>,
      body: <span class="code-string">'Содержание нового поста'</span>,
      userId: user.id
    });
    console.log(<span class="code-string">'Created post:'</span>, newPost);
  } <span class="code-key">catch</span> (error) {
    console.error(<span class="code-string">'Error:'</span>, error.message);
  }
}
</pre>
            </div>
        </div>

        <div class="footer">
            <p>Бя</p>
        </div>
    </div>
</body>
</html>
  `;

    res.send(html);
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
