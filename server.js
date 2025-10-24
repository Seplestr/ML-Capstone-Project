const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve the static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// New API endpoint to handle form submissions
app.post('/predict-stats', async (req, res) => {
    const playerData = req.body;
    console.log("Received player data for prediction:", playerData);

    try {
        // Forward the data to the Python ML API
        const apiResponse = await axios.post('http://127.0.0.1:5000/predict', playerData);
        
        // Send the prediction back to the client
        res.json({ prediction: apiResponse.data.response });

    } catch (error) {
        let errorMsg = "Sorry, I'm having trouble thinking right now.";
        if (error.response) {
            console.error(`Error calling ML API: Server responded with status ${error.response.status}`, error.response.data);
            // Forward the specific error from the Python API if available
            errorMsg = error.response.data.error || errorMsg;
        } else if (error.request) {
            console.error('Error calling ML API: No response received. Is the Python server running?');
        } else {
            console.error('Error setting up request to ML API:', error.message);
        }
        res.status(500).json({ error: errorMsg });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});