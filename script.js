document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('player-stats-form');
    const resultDiv = document.getElementById('prediction-result');
    const predictButton = document.getElementById('predict-button');

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent the default form submission

        // Change button text to show it's working
        predictButton.textContent = 'Predicting...';
        predictButton.disabled = true;
        resultDiv.textContent = '';
        resultDiv.classList.remove('error');

        // Create a data object from the form inputs
        const formData = new FormData(form);
        const playerData = {};
        for (const [key, value] of formData.entries()) {
            // Convert numerical strings to numbers
            playerData[key] = isNaN(value) || value === '' ? value : Number(value);
        }

        try {
            const response = await fetch('/predict-stats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(playerData),
            });

            const data = await response.json();

            if (response.ok) {
                resultDiv.textContent = `Prediction Result: ${data.prediction}`;
            } else {
                resultDiv.textContent = `Error: ${data.error}`;
                resultDiv.classList.add('error');
            }
        } catch (error) {
            resultDiv.textContent = 'A network error occurred. Please check the console.';
            resultDiv.classList.add('error');
            console.error('Fetch Error:', error);
        } finally {
            // Restore button text and state
            predictButton.textContent = 'Predict Eligibility';
            predictButton.disabled = false;
        }
    });
});