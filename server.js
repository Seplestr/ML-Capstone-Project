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
        // Map incoming frontend fields to the model's expected features.
        // This makes the backend resilient to missing fields like 'skill_moves' or 'potential'
        const mapped = {
            age: playerData.age !== undefined ? playerData.age : 0,
            weight_kg: playerData.weight_kg !== undefined ? playerData.weight_kg : (playerData.weight || 0),
            // If potential isn't provided, estimate it as the average of the numeric attributes (rounded)
            potential: playerData.potential !== undefined ? playerData.potential : Math.round(((playerData.pace||0) + (playerData.shooting||0) + (playerData.passing||0) + (playerData.dribbling||0) + (playerData.defending||0) + (playerData.physic||0)) / 6) || 0,
            // Use explicit skill_moves if provided, otherwise use dribbling as a proxy
            skill_moves: playerData.skill_moves !== undefined ? playerData.skill_moves : (playerData.dribbling !== undefined ? playerData.dribbling : 0),
            work_rate: playerData.work_rate || 'Unknown_Category',
            body_type: playerData.body_type || 'Unknown_Category',
            pace: playerData.pace !== undefined ? playerData.pace : 0,
            shooting: playerData.shooting !== undefined ? playerData.shooting : 0,
            passing: playerData.passing !== undefined ? playerData.passing : 0,
            defending: playerData.defending !== undefined ? playerData.defending : 0,
            physic: playerData.physic !== undefined ? playerData.physic : 0,
            player_traits: playerData.player_traits || ''
        };

        // Forward the normalized payload to the Python ML API
        const apiResponse = await axios.post('http://127.0.0.1:5000/predict', mapped);

    // Normalize and forward the Python API response. The Python API returns
    // { prediction: <int>, message: <str> } so forward those fields to the client.
    const pythonData = apiResponse && apiResponse.data ? apiResponse.data : {};
    const prediction = pythonData.prediction !== undefined ? pythonData.prediction : (pythonData.response || null);
    const message = pythonData.message || null;
    const overall_calc = pythonData.overall_calculated !== undefined ? pythonData.overall_calculated : null;

        // Provide simple, human-readable reasons when prediction==0
        let reasons = [];
        try {
            if (prediction === 0) {
                // Check common weak areas
                if (mapped.pace !== undefined && mapped.pace < 70) reasons.push('Low pace');
                if (mapped.shooting !== undefined && mapped.shooting < 65) reasons.push('Low shooting');
                if (mapped.passing !== undefined && mapped.passing < 65) reasons.push('Low passing');
                if (mapped.defending !== undefined && mapped.defending < 60) reasons.push('Low defending');
                if (mapped.physic !== undefined && mapped.physic < 65) reasons.push('Low physicality');
                if (mapped.potential !== undefined && mapped.potential < 50) reasons.push('Low potential');
                if (mapped.skill_moves !== undefined && mapped.skill_moves < 3) reasons.push('Low skill moves');
                if (mapped.age !== undefined && mapped.age > 34) reasons.push('Age may be high');
                if (mapped.body_type && String(mapped.body_type).toLowerCase().includes('fat')) reasons.push('Body type may affect performance');
                if (reasons.length === 0) reasons.push('No single weak area detected; overall stats may be below model threshold');
            }
        } catch (e) {
            console.error('Error computing reasons:', e);
            reasons = [];
        }

    res.json({ prediction, message, reasons, overall_calculated: overall_calc });

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