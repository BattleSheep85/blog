/**
 * Permalink report page - loads a report by ID from /report/:id and renders
 * it with the shared renderer (window.TrueRank). Polls while still generating.
 */
(function () {
    'use strict';

    var pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
    var reportId = pathParts[pathParts.length - 1];

    if (!reportId || reportId === 'report' || !/^[a-z0-9]+$/.test(reportId)) {
        showError();
        return;
    }

    load();

    function load() {
        fetch('/api/research/' + reportId)
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                if (data.error) { showError(); return; }
                if (data.status === 'completed' && data.report) {
                    showReport(data.report, data.sourceCount, data.filteredCount);
                } else if (data.status === 'error') {
                    showError(data.error);
                } else {
                    var loadingEl = document.getElementById('report-loading');
                    if (loadingEl) {
                        var statusEl = loadingEl.querySelector('[data-loading-status]');
                        if (statusEl) statusEl.textContent = 'Status: ' + (data.status || 'pending');
                    }
                    setTimeout(function () { poll(0); }, 2000);
                }
            })
            .catch(function () { showError(); });
    }

    function poll(attempts) {
        if (attempts > 60) { showError('Report generation timed out.'); return; }
        fetch('/api/research/' + reportId)
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.status === 'completed' && data.report) {
                    showReport(data.report, data.sourceCount, data.filteredCount);
                } else if (data.status === 'error') {
                    showError(data.error);
                } else {
                    setTimeout(function () { poll(attempts + 1); }, 2000);
                }
            })
            .catch(function () { setTimeout(function () { poll(attempts + 1); }, 3000); });
    }

    function showReport(report, sourceCount, filteredCount) {
        hide('report-loading');
        hide('report-error');
        var content = document.getElementById('report-content');
        if (!content || !window.TrueRank) return;
        content.classList.remove('hidden');

        // Update title + breadcrumb from the query / summary.
        if (report.executive_summary) {
            document.title = 'TrueRank · ' + report.executive_summary.slice(0, 60);
        }
        var heading = document.getElementById('report-heading');
        if (heading) {
            heading.textContent = report.query || (report.products && report.products[0] && report.products[0].name) || 'Research report';
        }

        window.TrueRank.mountReport(content, report, {
            reportId: reportId,
            sourceCount: sourceCount,
            filteredCount: filteredCount,
            withFeedback: true,
            withPermalink: false,
        });
    }

    function showError(message) {
        hide('report-loading');
        hide('report-content');
        var el = document.getElementById('report-error');
        if (el) {
            el.classList.remove('hidden');
            if (message) {
                var p = el.querySelector('[data-error-message]');
                if (p) p.textContent = message;
            }
        }
    }

    function hide(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }
})();
