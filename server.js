// server.js (located in the 'backend' folder)

// Import the 'path' module which is essential for working with file paths
const path = require('path');

// 1. Load environment variables first
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg'); // ADD: PostgreSQL connection pool

const app = express();

// 💡 CHANGE 1: Use process.env.PORT for Render, falling back to 5500 locally
// Render assigns a port dynamically (usually 10000) via an environment variable.
const port = process.env.PORT || 5500;

// --- MIDDLEWARE ---
app.use(bodyParser.json());

// 🎯 FRONTEND CONNECTION SETUP 🎯

// 1. Serve Static Assets (CSS, JS, IMAGES)
// Your frontend is likely deployed separately or served via a build step.
// If this backend is ONLY serving the API, you may not need these static routes.
// Assuming your frontend is separate, keep them for local testing but focus on API.
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
    // Render automatically detects DATABASE_URL and connects.
    connectionString: process.env.DATABASE_URL,
    // Add SSL for secure connection on Render
    ssl: {
        rejectUnauthorized: false
    }
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
        // Ensure these are set as App Passwords if using Gmail!
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- CORS CONFIGURATION (MOVED TO THE TOP MIDDLEWARE) ---
// 💡 CHANGE 2: Simple CORS is better for deployed API, especially since your frontend failed.
// The complex logic below can be replaced with a simple allow-all for now 
// until we solve the 405 error, or replace 'https://your-domain.com'
// with your actual Render frontend URL.
app.use(cors()); // Simplifies configuration and places it with other middleware.

/* // REMOVED COMPLEX CORS LOGIC (for now, to simplify debugging)
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
*/

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
            from: `${name} <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_RECEIVER,
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

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully! Message ID:', info.messageId); // Log message ID


        // 3. RESPOND TO CLIENT
        res.json({ message: 'Form submitted and email sent successfully!' });

    } catch (error) {
        // IMPORTANT: Log the full Nodemailer error to your Render console
        console.error('Submission Error:', error.message, error);

        // 💡 CHANGE 3: Better client-side error message on 500
        // Send a generic message but log the technical one.
        res.status(500).json({
            message: 'Failed to send message. Please check server logs for details (Error 500).',
            // Do NOT send error.message to client as it may contain sensitive info
            // technical_error: error.message 
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


// --- START SERVER ---
app.listen(port, () => {
    // Log the dynamic port for clarity
    console.log(`Server is running and serving your portfolio at http://localhost:${port}`);
});