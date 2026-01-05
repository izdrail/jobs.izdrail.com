document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('results-container');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (!query) return;

        // Show loading state
        resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const response = await fetch('/api/v1/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ keyword: query })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch jobs');
            }

            const data = await response.json();
            renderJobs(data.data);
        } catch (error) {
            console.error(error);
            resultsContainer.innerHTML = `
                <div class="error-msg">
                    <h3>Oops! Something went wrong.</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    });

    function renderJobs(jobs) {
        resultsContainer.innerHTML = '';

        if (!jobs || jobs.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align:center; width:100%; color: var(--text-secondary);">No jobs found. Try a different keyword.</p>';
            return;
        }

        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card';

            const title = job.title || 'Untitled Job';
            const company = job.company || 'Unknown Company';
            const location = job.location || 'Remote / Unknown';
            const type = job.job_type || 'Full-time';
            const posted = job.date_posted ? new Date(job.date_posted).toLocaleDateString() : 'Recently';
            const url = job.job_url || '#';
            const logo = job.logo_photo_url || null;
            const site = job.site || 'Source';

            const description = stripHtml(job.description || '').substring(0, 150) + '...';

            const logoHtml = logo
                ? `<img src="${logo}" alt="${company} logo" class="company-logo" onerror="this.style.display='none'">`
                : `<div class="company-logo" style="display:flex;align-items:center;justify-content:center;font-weight:bold;color:#333;">${company.charAt(0)}</div>`;

            card.innerHTML = `
                <div class="job-header">
                    ${logoHtml}
                    <span class="job-site-badge">${site}</span>
                </div>
                <h3 class="job-title">${title}</h3>
                <div class="company-name">${company}</div>
                
                <div class="job-meta">
                    <div class="meta-item">📍 ${location}</div>
                    <div class="meta-item">💼 ${type}</div>
                    <div class="meta-item">🕒 ${posted}</div>
                </div>

                <div class="job-description-preview">
                    ${description}
                </div>

                <a href="${url}" target="_blank" class="apply-btn">Apply Now</a>
            `;

            resultsContainer.appendChild(card);
        });
    }

    function stripHtml(html) {
        let tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }
});
