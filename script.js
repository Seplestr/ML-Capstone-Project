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

        // Create a data object from the form inputs.
        // Omit empty inputs so backend can apply defaults.
        const formData = new FormData(form);
        const playerData = {};
        const numericFields = ['age','weight_kg','potential','skill_moves','pace','shooting','passing','defending','physic'];
        for (const [key, value] of formData.entries()) {
            // Skip empty values (no input provided)
            if (value === null || value === undefined || value.trim() === '') {
                continue;
            }

            if (numericFields.includes(key)) {
                const n = Number(value);
                // If conversion fails, skip the field to let backend handle defaults
                if (!Number.isNaN(n)) playerData[key] = n;
            } else {
                playerData[key] = value;
            }
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
                // Show a friendly banner using the message if available, otherwise fall back to numeric prediction
                const pred = data.prediction;
                const msg = data.message || (pred === 1 ? 'Player is Eligible to Play' : 'Player is Not Eligible to Play');

                // Create banner
                resultDiv.innerHTML = '';
                resultDiv.classList.remove('error');
                const banner = document.createElement('div');
                banner.className = 'result-banner ' + (pred === 1 ? 'eligible' : 'not-eligible');

                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.textContent = pred === 1 ? '✓' : '✕';

                const texts = document.createElement('div');
                const title = document.createElement('div');
                title.textContent = msg;
                const sub = document.createElement('div');
                sub.className = 'result-subtext';
                sub.textContent = `Prediction: ${pred}` + (data.probability ? ` • Prob: ${JSON.stringify(data.probability)}` : '');

                texts.appendChild(title);
                texts.appendChild(sub);

                // If backend provided reasons for non-eligibility, show them
                if (Array.isArray(data.reasons) && data.reasons.length > 0) {
                    const reasonTitle = document.createElement('div');
                    reasonTitle.style.marginTop = '8px';
                    reasonTitle.style.fontSize = '13px';
                    reasonTitle.style.opacity = '0.95';
                    reasonTitle.textContent = 'Possible reasons for not being eligible:';

                    const ul = document.createElement('ul');
                    ul.style.margin = '6px 0 0 18px';
                    ul.style.padding = '0';
                    ul.style.fontSize = '13px';
                    ul.style.fontWeight = '500';
                    data.reasons.forEach(r => {
                        const li = document.createElement('li');
                        li.textContent = r;
                        ul.appendChild(li);
                    });
                    texts.appendChild(reasonTitle);
                    texts.appendChild(ul);
                }
                banner.appendChild(badge);
                banner.appendChild(texts);

                // Create an overall circle indicator if provided
                const overallContainer = document.createElement('div');
                overallContainer.className = 'overall-container';

                if (data.overall_calculated !== undefined && data.overall_calculated !== null) {
                    const overall = document.createElement('div');
                    overall.className = 'overall-circle';

                    // inner circle holds the text
                    const inner = document.createElement('div');
                    inner.className = 'inner';
                    const val = document.createElement('div');
                    val.className = 'value';
                    val.textContent = data.overall_calculated;
                    const lbl = document.createElement('div');
                    lbl.className = 'label';
                    lbl.textContent = 'Calculated Overall';

                    inner.appendChild(val);
                    inner.appendChild(lbl);
                    overall.appendChild(inner);

                    // color code based on score
                    const score = Number(data.overall_calculated);
                    if (!Number.isNaN(score)) {
                        if (score >= 75) overall.classList.add('green');
                        else if (score >= 60) overall.classList.add('orange');
                        else overall.classList.add('red');
                    }

                    overallContainer.appendChild(banner);
                    overallContainer.appendChild(overall);
                    resultDiv.appendChild(overallContainer);

                    // animate the ring by setting CSS variable --pct (0..100)
                    try {
                        overall.style.setProperty('--pct', '0');
                        // ensure badge/label update happens before animation
                        window.requestAnimationFrame(() => {
                            const score = Number(data.overall_calculated);
                            const pct = Math.max(0, Math.min(100, isNaN(score) ? 0 : Math.round(score)));
                            overall.style.setProperty('--pct', String(pct));
                        });
                    } catch (e) {
                        // ignore styling errors
                    }
                } else {
                    resultDiv.appendChild(banner);
                }
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