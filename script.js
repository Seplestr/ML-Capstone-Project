document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('player-stats-form');
    const resultDiv = document.getElementById('prediction-result');
    const predictButton = document.getElementById('predict-button');

        function animateCount(element, target, duration = 900) {
            const start = 0;
            const range = target - start;
            const startTime = performance.now();

            function step(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const value = Math.round(start + range * eased);
                element.textContent = value;
                if (progress < 1) requestAnimationFrame(step);
            }

            requestAnimationFrame(step);
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            predictButton.textContent = 'Predicting...';
            predictButton.disabled = true;
            resultDiv.textContent = '';
            resultDiv.classList.remove('error');

            const formData = new FormData(form);
            const playerData = {};
            const numericFields = ['age','weight_kg','potential','skill_moves','pace','shooting','passing','defending','physic'];
            for (const [key, value] of formData.entries()) {
                if (value === null || value === undefined || value.trim() === '') continue;
                if (numericFields.includes(key)) {
                    const n = Number(value);
                    if (!Number.isNaN(n)) playerData[key] = n;
                } else {
                    playerData[key] = value;
                }
            }

            try {
                const response = await fetch('/predict-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(playerData),
                });
                const data = await response.json();

                if (!response.ok) {
                    resultDiv.textContent = 'Error: ' + (data.error || 'Unknown');
                    resultDiv.classList.add('error');
                    return;
                }

                const pred = data.prediction;
                const msg = data.message || (pred === 1 ? 'Player is Eligible to Play' : 'Player is Not Eligible to Play');

                resultDiv.innerHTML = '';
                const banner = document.createElement('div');
                banner.className = 'result-banner ' + (pred === 1 ? 'eligible' : 'not-eligible');

                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.innerHTML = pred === 1
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.12)"/><path d="M7 13l3 3 7-7" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.12)"/><path d="M9.5 9.5L14.5 14.5M14.5 9.5L9.5 14.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

                const texts = document.createElement('div');
                const title = document.createElement('div');
                title.textContent = msg;
                const sub = document.createElement('div');
                sub.className = 'result-subtext';
                sub.textContent = 'Prediction: ' + pred + (data.probability ? ' • Prob: ' + JSON.stringify(data.probability) : '');
                texts.appendChild(title);
                texts.appendChild(sub);

                if (Array.isArray(data.reasons) && data.reasons.length) {
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
                    data.reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
                    texts.appendChild(reasonTitle);
                    texts.appendChild(ul);
                }

                banner.appendChild(badge);
                banner.appendChild(texts);

                const overallContainer = document.createElement('div');
                overallContainer.className = 'overall-container';

                if (data.overall_calculated !== undefined && data.overall_calculated !== null) {
                    const overall = document.createElement('div');
                    overall.className = 'overall-circle';

                    const inner = document.createElement('div');
                    inner.className = 'inner';

                    const details = document.createElement('div');
                    details.className = 'overall-details';
                    const val = document.createElement('div');
                    val.className = 'overall-value';
                    val.textContent = '0';
                    const lbl = document.createElement('div');
                    lbl.className = 'overall-label';
                    lbl.textContent = 'Calculated Overall';
                    details.appendChild(val);
                    details.appendChild(lbl);

                    const meterWrap = document.createElement('div');
                    meterWrap.className = 'overall-meter';
                    const bar = document.createElement('div');
                    bar.className = 'bar';
                    meterWrap.appendChild(bar);

                    inner.appendChild(details);
                    inner.appendChild(meterWrap);
                    overall.appendChild(inner);

                    const score = Number(data.overall_calculated);
                    if (!Number.isNaN(score)) {
                        if (score >= 75) overall.classList.add('green');
                        else if (score >= 60) overall.classList.add('orange');
                        else overall.classList.add('red');
                        animateCount(val, Math.round(score), 1000);
                    }

                    overallContainer.appendChild(banner);
                    overallContainer.appendChild(overall);
                    resultDiv.appendChild(overallContainer);

                    try {
                        overall.style.setProperty('--pct', '0%');
                        const pct = Math.max(0, Math.min(100, isNaN(score) ? 0 : Math.round(score)));
                        window.requestAnimationFrame(() => {
                            overall.style.setProperty('--pct', String(pct) + '%');
                            const b = overall.querySelector('.overall-meter .bar');
                            if (b) b.style.width = pct + '%';
                        });
                    } catch (e) { /* ignore styling errors */ }
                } else {
                    resultDiv.appendChild(banner);
                }
            } catch (error) {
                resultDiv.textContent = 'A network error occurred. Please check the console.';
                resultDiv.classList.add('error');
                console.error('Fetch Error:', error);
            } finally {
                predictButton.textContent = 'Predict Eligibility';
                predictButton.disabled = false;
            }
        });
    });