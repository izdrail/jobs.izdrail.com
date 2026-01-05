document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('results-container');
    const filtersSection = document.getElementById('filters-section');

    let allJobs = []; // Store all jobs for filtering
    let activeFilters = {
        site: 'all',
        type: 'all',
        remote: 'all',
        days: 'all'
    };

    // Initialize filter event listeners
    initializeFilters();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (!query) return;

        // Show loading state
        resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        filtersSection.style.display = 'none';

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
            allJobs = data.data || [];

            // Sort by date descending (newest first)
            allJobs.sort((a, b) => {
                const dateA = a.date_posted ? new Date(a.date_posted) : new Date(0);
                const dateB = b.date_posted ? new Date(b.date_posted) : new Date(0);
                return dateB - dateA;
            });

            // Show filters and render jobs
            if (allJobs.length > 0) {
                filtersSection.style.display = 'block';
            }
            renderJobs(allJobs);
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

    function initializeFilters() {
        // Site filters
        document.querySelectorAll('#site-filters .filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                setActiveFilter('#site-filters', pill);
                activeFilters.site = pill.dataset.site;
                applyFilters();
            });
        });

        // Type filters
        document.querySelectorAll('#type-filters .filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                setActiveFilter('#type-filters', pill);
                activeFilters.type = pill.dataset.type;
                applyFilters();
            });
        });

        // Remote filters
        document.querySelectorAll('[data-remote]').forEach(pill => {
            pill.addEventListener('click', () => {
                setActiveFilter('[data-remote]', pill);
                activeFilters.remote = pill.dataset.remote;
                applyFilters();
            });
        });

        // Date filters
        document.querySelectorAll('#date-filters .filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                setActiveFilter('#date-filters', pill);
                activeFilters.days = pill.dataset.days;
                applyFilters();
            });
        });

        // Clear filters button
        document.getElementById('clear-filters').addEventListener('click', () => {
            activeFilters = { site: 'all', type: 'all', remote: 'all', days: 'all' };
            document.querySelectorAll('.filter-pill').forEach(pill => {
                pill.classList.remove('active');
            });
            document.querySelectorAll('[data-site="all"], [data-type="all"], [data-remote="all"], [data-days="all"]').forEach(pill => {
                pill.classList.add('active');
            });
            applyFilters();
        });
    }

    function setActiveFilter(selector, activePill) {
        document.querySelectorAll(`${selector} .filter-pill`).forEach(pill => {
            pill.classList.remove('active');
        });
        activePill.classList.add('active');
    }

    function applyFilters() {
        let filteredJobs = [...allJobs];

        // Filter by site
        if (activeFilters.site !== 'all') {
            filteredJobs = filteredJobs.filter(job => job.site === activeFilters.site);
        }

        // Filter by type
        if (activeFilters.type !== 'all') {
            filteredJobs = filteredJobs.filter(job => {
                const jobType = (job.job_type || '').toLowerCase();
                return jobType.includes(activeFilters.type);
            });
        }

        // Filter by remote
        if (activeFilters.remote !== 'all') {
            const isRemoteFilter = activeFilters.remote === 'true';
            filteredJobs = filteredJobs.filter(job => job.is_remote === isRemoteFilter);
        }

        // Filter by date
        if (activeFilters.days !== 'all') {
            const daysAgo = parseInt(activeFilters.days);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

            filteredJobs = filteredJobs.filter(job => {
                if (!job.date_posted) return false;
                const jobDate = new Date(job.date_posted);
                return jobDate >= cutoffDate;
            });
        }

        renderJobs(filteredJobs);
    }

    function renderJobs(jobs) {
        resultsContainer.innerHTML = '';

        if (!jobs || jobs.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align:center; width:100%; color: var(--text-secondary);">No jobs found matching your filters. Try adjusting your criteria.</p>';
            return;
        }

        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card';

            const title = job.title || 'Untitled Job';

            // Extract domain from job URL if company name is missing
            let company = job.company;
            if (!company && job.job_url) {
                try {
                    const urlObj = new URL(job.job_url);
                    company = urlObj.hostname.replace('www.', '');
                } catch (e) {
                    company = 'Company';
                }
            } else if (!company) {
                company = 'Company';
            }

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
