// server.js (located in the 'backend' folder)

// Import the 'path' module which is essential for working with file paths
const path = require('path');

// 1. Load environment variables first
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
// REMOVE: const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg'); // ADD: PostgreSQL connection pool

const app = express();
const port = 5500; // Matches your frontend fetch call

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// 🎯 FRONTEND CONNECTION SETUP 🎯

// 1. Serve Static Assets (CSS, JS, IMAGES)
app.use(express.static(path.join(__dirname, 'frontend')));


// 2. Serve the Main Portfolio Page (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// 3. Serve the Submissions Dashboard (submissions.html)
app.get('/submissions.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'submissions.html'));
});

// --- DATABASE SETUP (PostgreSQL) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                about TEXT,
                prompt TEXT NOT NULL,
                submission_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        client.release();
        console.log('Connected to PostgreSQL and Submissions table is ready.');
    } catch (err) {
        console.error('Error connecting to or initializing PostgreSQL:', err.message);
    }
}
// IMPORTANT: Call the function to start the database connection
initializeDatabase();

// --- EMAIL TRANSPORTER SETUP ---
// Using credentials from .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- API ENDPOINT: POST /submit ---
app.post('/submit', async (req, res) => {
    const { name, email, about, prompt } = req.body;

    if (!name || !email || !prompt) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        // 1. SAVE TO DATABASE (POSTGRESQL IMPLEMENTATION)
        const insertSql = 'INSERT INTO submissions (name, email, about, prompt) VALUES ($1, $2, $3, $4) RETURNING id';
        const values = [name, email, about, prompt];

        // Use pool.query for PostgreSQL
        const dbResult = await pool.query(insertSql, values);
        console.log(`Saved submission ID: ${dbResult.rows[0].id}`);

        // 2. SEND EMAIL
        const mailOptions = {
            // ✅ SECURE/RELIABLE FROM: Uses your authorized sender but displays the user's name
            from: `${name} <${process.env.EMAIL_USER}>`,

            // ✅ TO: Your online receiving email address
            to: process.env.EMAIL_RECEIVER,

            // ✅ REPLY-TO: Ensures your reply goes directly to the user's email
            replyTo: email,

            subject: `New Portfolio Inquiry: ${about || 'General'} from ${name}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Subject (About):</strong> ${about || 'Not specified'}</p>
                <h3>Details:</h3>
                <p>${prompt.replace(/\n/g, '<br>')}</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully!');

        // 3. RESPOND TO CLIENT
        res.json({ message: 'Form submitted and email sent successfully!' });

    } catch (error) {
        console.error('Submission Error:', error);
        res.status(500).json({
            message: 'Failed to process submission. Check server logs.',
            error: error.message
        });
    }
});

// --- API ENDPOINT: GET /submissions (for data, used by submissions.html) ---
app.get('/submissions', async (req, res) => {
    const sql = 'SELECT * FROM submissions ORDER BY submission_date DESC';

    try {
        // Use pool.query for PostgreSQL
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- CORS CONFIGURATION ---
const allowedOrigins = ['http://localhost:5500', 'https://your-domain.com']; // Replace with your actual domain

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server is running and serving your portfolio at http://localhost:${port}`);
});