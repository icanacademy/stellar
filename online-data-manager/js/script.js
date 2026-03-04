/**
 * Online Data Manager — CSV admin interface for online report data.
 */
document.addEventListener('DOMContentLoaded', function () {
    // ── Auth Gate ──
    var dmToken = sessionStorage.getItem('dm_token_online') || '';

    // Auth-aware fetch wrapper
    function dmFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        if (dmToken) opts.headers['x-dm-token'] = dmToken;
        return fetch(url, opts).then(function (r) {
            if (r.status === 401) {
                // Token expired or invalid — show login again
                sessionStorage.removeItem('dm_token_online');
                dmToken = '';
                showAuthOverlay();
                throw new Error('Unauthorized');
            }
            return r;
        });
    }

    function showAuthOverlay() {
        document.getElementById('authOverlay').classList.remove('hidden');
        document.getElementById('authPassword').value = '';
        document.getElementById('authError').textContent = '';
        document.getElementById('authPassword').focus();
    }

    function hideAuthOverlay() {
        document.getElementById('authOverlay').classList.add('hidden');
    }

    // Handle auth form submit
    document.getElementById('authForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var pw = document.getElementById('authPassword').value;
        var errEl = document.getElementById('authError');
        var inputEl = document.getElementById('authPassword');
        errEl.textContent = '';

        fetch('/api/dm-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    dmToken = data.token;
                    sessionStorage.setItem('dm_token_online', dmToken);
                    hideAuthOverlay();
                    initApp();
                } else {
                    errEl.textContent = 'Incorrect password';
                    inputEl.classList.add('shake');
                    setTimeout(function () { inputEl.classList.remove('shake'); }, 500);
                    inputEl.value = '';
                    inputEl.focus();
                }
            })
            .catch(function () {
                errEl.textContent = 'Connection error';
            });
    });

    // Check if we have a valid token already
    if (dmToken) {
        // Verify token is still valid with a quick call
        dmFetch('/api/csv-stats')
            .then(function (r) { return r.json(); })
            .then(function () { hideAuthOverlay(); initApp(); })
            .catch(function () { /* showAuthOverlay already called by dmFetch on 401 */ });
    }
    // If no token, overlay is visible by default

    function initApp() {
        // ── Initial load ──
        loadTab('overview');
    }

    // ── State ──
    var currentTab = 'overview';
    var tabLoaded = { overview: false, browse: false, duplicates: false, subjects: false, backups: false };
    var browseState = { page: 1, limit: 50 };
    var lastFetchedRows = [];
    var statsCache = null;
    var confirmCallback = null;

    // ── Tab Switching ──
    var tabs = document.querySelectorAll('.dm-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.getAttribute('data-tab');
            if (target === currentTab) return;
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.dm-panel').forEach(function (p) { p.classList.remove('active'); });
            document.getElementById('panel-' + target).classList.add('active');
            currentTab = target;
            loadTab(target);
        });
    });

    // ── Toast ──
    function showToast(msg, type) {
        var toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'dm-toast ' + (type || 'info') + ' show';
        setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }

    // ── Confirm Modal ──
    function showConfirm(title, msg, callback) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = msg;
        document.getElementById('confirmModal').style.display = 'flex';
        confirmCallback = callback;
    }

    document.getElementById('confirmOk').addEventListener('click', function () {
        document.getElementById('confirmModal').style.display = 'none';
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
    });

    document.getElementById('confirmCancel').addEventListener('click', function () {
        document.getElementById('confirmModal').style.display = 'none';
        confirmCallback = null;
    });

    document.getElementById('confirmModalClose').addEventListener('click', function () {
        document.getElementById('confirmModal').style.display = 'none';
        confirmCallback = null;
    });

    // ── Load Tab (lazy) ──
    function loadTab(tab) {
        switch (tab) {
            case 'overview': loadOverview(); break;
            case 'browse': loadBrowse(); break;
            case 'duplicates': loadDuplicates(); break;
            case 'subjects': loadSubjects(); break;
            case 'backups': loadBackups(); break;
        }
    }

    // ════════════════════════════════════════════
    // OVERVIEW TAB
    // ════════════════════════════════════════════
    function loadOverview() {
        fetchStats().then(function (stats) {
            document.getElementById('statTotalRows').textContent = stats.totalRows.toLocaleString();
            document.getElementById('statDuplicates').textContent = stats.duplicateCount.toLocaleString();
            document.getElementById('statSubjects').textContent = stats.subjectCount.toLocaleString();
            document.getElementById('statStudents').textContent = stats.studentCount.toLocaleString();
        });
    }

    function fetchStats() {
        return dmFetch('/api/csv-stats')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                statsCache = data;
                return data;
            });
    }

    // Quick actions
    document.getElementById('btnCreateBackup').addEventListener('click', function () {
        dmFetch('/api/csv-backups', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showToast('Backup created: ' + data.filename, 'success');
                } else {
                    showToast('Failed to create backup', 'error');
                }
            })
            .catch(function () { showToast('Error creating backup', 'error'); });
    });

    document.getElementById('btnRemoveAllDups').addEventListener('click', function () {
        showConfirm('Remove All Duplicates',
            'This will remove all duplicate rows (keeping the latest occurrence of each). A backup will be created automatically. Continue?',
            function () { performDedup(); }
        );
    });

    function performDedup() {
        dmFetch('/api/csv-duplicates', { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showToast('Removed ' + data.removed + ' duplicate rows', 'success');
                    statsCache = null;
                    tabLoaded.duplicates = false;
                    loadOverview();
                } else {
                    showToast('Failed to remove duplicates', 'error');
                }
            })
            .catch(function () { showToast('Error removing duplicates', 'error'); });
    }

    // ════════════════════════════════════════════
    // BROWSE & EDIT TAB
    // ════════════════════════════════════════════
    var searchTimeout = null;

    function loadBrowse() {
        // Populate filter dropdowns from stats
        ensureStats().then(function (stats) {
            populateSelect('browseStudent', stats.students.map(function (s) { return s.name; }), 'All Students');
            populateSelect('browseSubject', stats.subjects.map(function (s) { return s.name; }), 'All Subjects');
        });
        fetchBrowseData();
    }

    function ensureStats() {
        if (statsCache) return Promise.resolve(statsCache);
        return fetchStats();
    }

    function populateSelect(id, options, defaultLabel) {
        var sel = document.getElementById(id);
        var current = sel.value;
        sel.innerHTML = '<option value="">' + defaultLabel + '</option>';
        options.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            sel.appendChild(o);
        });
        if (current) sel.value = current;
    }

    function fetchBrowseData() {
        var params = new URLSearchParams();
        params.set('page', browseState.page);
        params.set('limit', browseState.limit);
        var search = document.getElementById('browseSearch').value.trim();
        var student = document.getElementById('browseStudent').value;
        var subject = document.getElementById('browseSubject').value;
        var dateFrom = document.getElementById('browseDateFrom').value;
        var dateTo = document.getElementById('browseDateTo').value;
        if (search) params.set('search', search);
        if (student) params.set('student', student);
        if (subject) params.set('subject', subject);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        dmFetch('/api/csv-data?' + params.toString())
            .then(function (r) { return r.json(); })
            .then(function (data) {
                lastFetchedRows = data.rows;
                renderBrowseTable(data.rows);
                renderBrowsePagination(data.page, data.totalPages, data.total);
            })
            .catch(function () { showToast('Error loading data', 'error'); });
    }

    function renderBrowseTable(rows) {
        var tbody = document.getElementById('browseBody');
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#999;">No rows found</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            var coop = r.Cooperation || '';
            var eng = r.Engagement || '';

            return '<tr>' +
                '<td><input type="checkbox" class="row-check" data-index="' + r._index + '"></td>' +
                '<td>' + r._index + '</td>' +
                '<td>' + esc(r.Date) + '</td>' +
                '<td>' + esc(r['Student Name']) + '</td>' +
                '<td>' + esc(truncate(r['Teacher Name'], 25)) + '</td>' +
                '<td>' + esc(r.Subject) + '</td>' +
                '<td>' + esc(coop) + '</td>' +
                '<td>' + esc(eng) + '</td>' +
                '<td><button class="dm-btn dm-btn-sm dm-btn-secondary btn-edit-row" data-index="' + r._index + '">Edit</button></td>' +
                '</tr>';
        }).join('');

        // Re-check selectAll state
        document.getElementById('selectAll').checked = false;
        updateDeleteBtn();
    }

    function renderBrowsePagination(page, totalPages, total) {
        var div = document.getElementById('browsePagination');
        if (totalPages <= 1) {
            div.innerHTML = '<span class="dm-page-info">' + total + ' rows</span>';
            return;
        }
        var html = '<button class="dm-btn dm-btn-sm dm-btn-secondary" ' + (page <= 1 ? 'disabled' : '') + ' data-page="' + (page - 1) + '">&laquo; Prev</button>';
        html += '<span class="dm-page-info">Page ' + page + ' of ' + totalPages + ' (' + total + ' rows)</span>';
        html += '<button class="dm-btn dm-btn-sm dm-btn-secondary" ' + (page >= totalPages ? 'disabled' : '') + ' data-page="' + (page + 1) + '">Next &raquo;</button>';
        div.innerHTML = html;
    }

    // Toolbar events
    document.getElementById('browseSearch').addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () { browseState.page = 1; fetchBrowseData(); }, 400);
    });
    ['browseStudent', 'browseSubject', 'browseDateFrom', 'browseDateTo'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', function () { browseState.page = 1; fetchBrowseData(); });
    });
    document.getElementById('browseClear').addEventListener('click', function () {
        document.getElementById('browseSearch').value = '';
        document.getElementById('browseStudent').value = '';
        document.getElementById('browseSubject').value = '';
        document.getElementById('browseDateFrom').value = '';
        document.getElementById('browseDateTo').value = '';
        browseState.page = 1;
        fetchBrowseData();
    });

    // Pagination clicks
    document.getElementById('browsePagination').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (btn && !btn.disabled) {
            browseState.page = parseInt(btn.getAttribute('data-page'));
            fetchBrowseData();
        }
    });

    // Select all checkbox
    document.getElementById('selectAll').addEventListener('change', function () {
        var checked = this.checked;
        document.querySelectorAll('.row-check').forEach(function (cb) { cb.checked = checked; });
        updateDeleteBtn();
    });

    // Row checkbox delegation
    document.getElementById('browseBody').addEventListener('change', function (e) {
        if (e.target.classList.contains('row-check')) updateDeleteBtn();
    });

    function getSelectedIndices() {
        return Array.from(document.querySelectorAll('.row-check:checked')).map(function (cb) {
            return parseInt(cb.getAttribute('data-index'));
        });
    }

    function updateDeleteBtn() {
        var indices = getSelectedIndices();
        var btn = document.getElementById('btnDeleteSelected');
        btn.disabled = indices.length === 0;
        btn.textContent = indices.length > 0 ? 'Delete Selected (' + indices.length + ')' : 'Delete Selected';
        var editBtn = document.getElementById('btnEditSelected');
        editBtn.disabled = indices.length === 0;
        editBtn.textContent = indices.length > 0 ? 'Edit Selected (' + indices.length + ')' : 'Edit Selected';
    }

    document.getElementById('btnDeleteSelected').addEventListener('click', function () {
        var indices = getSelectedIndices();
        if (indices.length === 0) return;
        showConfirm('Delete Rows', 'Delete ' + indices.length + ' selected row(s)? A backup will be created automatically.', function () {
            dmFetch('/api/csv-rows', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ indices: indices })
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.success) {
                        showToast('Deleted ' + data.deleted + ' row(s)', 'success');
                        statsCache = null;
                        fetchBrowseData();
                    } else {
                        showToast(data.error || 'Failed to delete', 'error');
                    }
                })
                .catch(function () { showToast('Error deleting rows', 'error'); });
        });
    });

    // Edit row button delegation
    document.getElementById('browseBody').addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-edit-row');
        if (btn) openEditModal(parseInt(btn.getAttribute('data-index')));
    });

    // ── Edit Modal ──
    var editingIndex = null;
    var editFieldOrder = ['Date', 'Day of Week', 'Student Name', 'Student ID', 'Grade Level',
        'Teacher Name', 'Teacher ID', 'Subject',
        'Current Lesson', 'Materials', 'Homework',
        'Activities Finished', 'Activities Not Finished', 'Student Gender',
        'Attention', 'Retention', 'Comprehension', 'Cooperation', 'Engagement', 'Conversation',
        'Skills', 'Narrative', 'Class Type'];
    var longFields = ['Activities Finished', 'Activities Not Finished', 'Skills', 'Narrative', 'Current Lesson', 'Homework'];

    function openEditModal(index) {
        var row = lastFetchedRows.find(function (r) { return r._index === index; });
        if (!row) { showToast('Row not found in current data', 'error'); return; }
        editingIndex = index;

        var body = document.getElementById('editModalBody');
        body.innerHTML = editFieldOrder.map(function (field) {
            var val = row[field] || '';
            var isLong = longFields.indexOf(field) !== -1;
            var inputTag = isLong
                ? '<textarea class="edit-field" data-field="' + esc(field) + '" rows="3">' + esc(val) + '</textarea>'
                : '<input type="text" class="edit-field" data-field="' + esc(field) + '" value="' + escAttr(val) + '">';
            return '<div class="dm-field-group"><label>' + esc(field) + '</label>' + inputTag + '</div>';
        }).join('');

        document.getElementById('editModal').style.display = 'flex';
    }

    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editModalCancel').addEventListener('click', closeEditModal);

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        editingIndex = null;
    }

    document.getElementById('editModalSave').addEventListener('click', function () {
        if (editingIndex === null) return;
        var updates = {};
        document.querySelectorAll('.edit-field').forEach(function (el) {
            updates[el.getAttribute('data-field')] = el.value;
        });

        dmFetch('/api/csv-row/' + editingIndex, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showToast('Row updated successfully', 'success');
                    closeEditModal();
                    statsCache = null;
                    fetchBrowseData();
                } else {
                    showToast(data.error || 'Failed to update', 'error');
                }
            })
            .catch(function () { showToast('Error updating row', 'error'); });
    });

    // ── Bulk Edit Modal ──
    document.getElementById('btnEditSelected').addEventListener('click', function () {
        var indices = getSelectedIndices();
        if (indices.length === 0) return;

        // Populate field dropdown
        var sel = document.getElementById('bulkEditField');
        sel.innerHTML = editFieldOrder.map(function (f) {
            return '<option value="' + escAttr(f) + '">' + esc(f) + '</option>';
        }).join('');

        // Reset value input
        swapBulkValueInput(editFieldOrder[0]);
        document.getElementById('bulkEditTitle').textContent = 'Bulk Edit (' + indices.length + ' rows)';
        document.getElementById('bulkEditApply').textContent = 'Apply to ' + indices.length + ' rows';
        document.getElementById('bulkEditModal').style.display = 'flex';
    });

    document.getElementById('bulkEditField').addEventListener('change', function () {
        swapBulkValueInput(this.value);
    });

    function swapBulkValueInput(field) {
        var container = document.getElementById('bulkEditValue').parentNode;
        var isLong = longFields.indexOf(field) !== -1;
        var existing = container.querySelector('#bulkEditValue');
        var val = existing ? existing.value : '';
        if (isLong) {
            var ta = document.createElement('textarea');
            ta.id = 'bulkEditValue';
            ta.className = 'dm-bulk-value';
            ta.rows = 3;
            ta.placeholder = 'Enter new value...';
            ta.value = val;
            existing.replaceWith(ta);
        } else {
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.id = 'bulkEditValue';
            inp.className = 'dm-bulk-value';
            inp.placeholder = 'Enter new value...';
            inp.value = val;
            existing.replaceWith(inp);
        }
    }

    function closeBulkEditModal() {
        document.getElementById('bulkEditModal').style.display = 'none';
    }

    document.getElementById('bulkEditModalClose').addEventListener('click', closeBulkEditModal);
    document.getElementById('bulkEditCancel').addEventListener('click', closeBulkEditModal);

    document.getElementById('bulkEditApply').addEventListener('click', function () {
        var indices = getSelectedIndices();
        if (indices.length === 0) return;
        var field = document.getElementById('bulkEditField').value;
        var value = document.getElementById('bulkEditValue').value;

        dmFetch('/api/csv-rows', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indices: indices, field: field, value: value })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showToast('Updated ' + data.updated + ' row(s)', 'success');
                    closeBulkEditModal();
                    statsCache = null;
                    fetchBrowseData();
                } else {
                    showToast(data.error || 'Failed to bulk edit', 'error');
                }
            })
            .catch(function () { showToast('Error bulk editing rows', 'error'); });
    });

    // ════════════════════════════════════════════
    // DUPLICATES TAB
    // ════════════════════════════════════════════
    function loadDuplicates() {
        var container = document.getElementById('dupGroups');
        container.innerHTML = '<p style="text-align:center;padding:30px;color:#999;">Loading...</p>';

        dmFetch('/api/csv-duplicates')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                document.getElementById('dupInfo').innerHTML =
                    '<strong>' + data.totalDuplicates + '</strong> duplicate rows in <strong>' + data.groupCount + '</strong> groups';

                if (data.groups.length === 0) {
                    container.innerHTML = '<p style="text-align:center;padding:30px;color:#999;">No duplicates found!</p>';
                    return;
                }

                container.innerHTML = data.groups.map(function (group) {
                    var headerHtml = '<div class="dm-dup-group-header">' +
                        '<div class="dm-dup-group-title">' + esc(group.date) + ' &mdash; ' + esc(group.student) + ' &mdash; ' + esc(group.subject) +
                        ' <span>(' + group.rows.length + ' copies)</span></div></div>';

                    var tableHtml = '<table><thead><tr>' +
                        '<th>Index</th><th>Teacher</th><th>Cooperation</th><th>Engagement</th><th>Narrative (preview)</th><th>Action</th>' +
                        '</tr></thead><tbody>' +
                        group.rows.map(function (r) {
                            return '<tr>' +
                                '<td>' + r._index + '</td>' +
                                '<td>' + esc(truncate(r['Teacher Name'], 20)) + '</td>' +
                                '<td>' + esc(r.Cooperation || '') + '</td>' +
                                '<td>' + esc(r.Engagement || '') + '</td>' +
                                '<td>' + esc(truncate(r.Narrative || '', 50)) + '</td>' +
                                '<td><button class="dm-btn dm-btn-sm dm-btn-danger btn-dup-delete" data-index="' + r._index + '">Delete</button></td>' +
                                '</tr>';
                        }).join('') +
                        '</tbody></table>';

                    return '<div class="dm-dup-group">' + headerHtml + tableHtml + '</div>';
                }).join('');
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#e74c3c;">Error loading duplicates</p>';
            });
    }

    // Duplicate delete button delegation
    document.getElementById('dupGroups').addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-dup-delete');
        if (btn) {
            var index = parseInt(btn.getAttribute('data-index'));
            showConfirm('Delete Row', 'Delete row #' + index + '? A backup will be created.', function () {
                dmFetch('/api/csv-rows', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ indices: [index] })
                })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data.success) {
                            showToast('Row deleted', 'success');
                            statsCache = null;
                            loadDuplicates();
                        } else {
                            showToast(data.error || 'Failed to delete', 'error');
                        }
                    })
                    .catch(function () { showToast('Error deleting row', 'error'); });
            });
        }
    });

    document.getElementById('btnAutoDedup').addEventListener('click', function () {
        showConfirm('Remove All Duplicates',
            'This will remove all duplicate rows, keeping only the latest occurrence. A backup will be created. Continue?',
            function () { performDedup(); }
        );
    });

    // ════════════════════════════════════════════
    // SUBJECT MANAGER TAB
    // ════════════════════════════════════════════
    function loadSubjects() {
        ensureStats().then(function (stats) {
            // Populate merge dropdowns
            var subjects = stats.subjects.map(function (s) { return s.name; });
            populateSelect('mergeFrom', subjects, '-- Select Subject --');
            populateSelect('mergeTo', subjects, '-- Select Subject --');

            // Render subject list
            var container = document.getElementById('subjectList');
            container.innerHTML = stats.subjects.map(function (s) {
                return '<div class="dm-subject-item">' +
                    '<span class="dm-subject-name">' + esc(s.name) + '</span>' +
                    '<span class="dm-subject-count">' + s.count + ' rows</span>' +
                    '</div>';
            }).join('');
        });
    }

    // Merge button enable/disable
    document.getElementById('mergeFrom').addEventListener('change', updateMergeBtn);
    document.getElementById('mergeTo').addEventListener('change', updateMergeBtn);

    function updateMergeBtn() {
        var from = document.getElementById('mergeFrom').value;
        var to = document.getElementById('mergeTo').value;
        document.getElementById('btnMerge').disabled = !from || !to || from === to;
    }

    document.getElementById('btnMerge').addEventListener('click', function () {
        var from = document.getElementById('mergeFrom').value;
        var to = document.getElementById('mergeTo').value;
        if (!from || !to || from === to) return;

        showConfirm('Merge Subjects',
            'Rename all rows with subject "' + from + '" to "' + to + '"? A backup will be created.',
            function () {
                dmFetch('/api/csv-merge-subject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: from, to: to })
                })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data.success) {
                            showToast('Merged ' + data.merged + ' rows', 'success');
                            statsCache = null;
                            loadSubjects();
                        } else {
                            showToast(data.error || 'Failed to merge', 'error');
                        }
                    })
                    .catch(function () { showToast('Error merging subjects', 'error'); });
            }
        );
    });

    // ════════════════════════════════════════════
    // BACKUPS TAB
    // ════════════════════════════════════════════
    function loadBackups() {
        var container = document.getElementById('backupList');
        container.innerHTML = '<p style="text-align:center;padding:20px;color:#999;">Loading...</p>';

        dmFetch('/api/csv-backups')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.backups.length === 0) {
                    container.innerHTML = '<p style="text-align:center;padding:30px;color:#999;">No backups yet</p>';
                    return;
                }
                container.innerHTML = data.backups.map(function (b) {
                    return '<div class="dm-backup-item">' +
                        '<div class="dm-backup-info">' +
                        '<div class="dm-backup-filename">' + esc(b.filename) + '</div>' +
                        '<div class="dm-backup-meta">' + esc(b.sizeFormatted) + ' &mdash; ' + esc(b.dateFormatted) + '</div>' +
                        '</div>' +
                        '<div class="dm-backup-actions">' +
                        '<button class="dm-btn dm-btn-sm dm-btn-primary btn-restore" data-filename="' + escAttr(b.filename) + '">Restore</button>' +
                        '</div>' +
                        '</div>';
                }).join('');
            })
            .catch(function () {
                container.innerHTML = '<p style="color:#e74c3c;">Error loading backups</p>';
            });
    }

    document.getElementById('btnNewBackup').addEventListener('click', function () {
        dmFetch('/api/csv-backups', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showToast('Backup created: ' + data.filename, 'success');
                    loadBackups();
                } else {
                    showToast('Failed to create backup', 'error');
                }
            })
            .catch(function () { showToast('Error creating backup', 'error'); });
    });

    // Backup restore delegation
    document.getElementById('backupList').addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-restore');
        if (btn) {
            var filename = btn.getAttribute('data-filename');
            showConfirm('Restore Backup',
                'Restore from "' + filename + '"? The current CSV will be backed up first.',
                function () {
                    dmFetch('/api/csv-backups/' + encodeURIComponent(filename) + '/restore', { method: 'POST' })
                        .then(function (r) { return r.json(); })
                        .then(function (data) {
                            if (data.success) {
                                showToast('Restored successfully', 'success');
                                statsCache = null;
                                loadBackups();
                                loadOverview();
                            } else {
                                showToast(data.error || 'Restore failed', 'error');
                            }
                        })
                        .catch(function () { showToast('Error restoring backup', 'error'); });
                }
            );
        }
    });

    // ── Utilities ──
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }
});
