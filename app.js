class App {
    constructor() {
        // Database Initialization
        try {
            this.users = JSON.parse(localStorage.getItem('mf_users')) || [];
        } catch (e) {
            console.error('User database corrupted', e);
            this.users = [];
        }
        this.currentUser = localStorage.getItem('mf_current_user') || null;
        this.currentRole = localStorage.getItem('mf_current_role') || null;
        this.isRegisterMode = false;

        // Super Admin Identification
        this.SUPER_ADMIN = 'fathy mohamed fathy';
        this.isSuperAdmin = this.currentUser === this.SUPER_ADMIN;

        // Load data if user is logged in
        // Load data if user is logged in
        this.data = this.loadUserData(this.currentUser);
        this.currentFolders = { vehicles: null, clients: null, bills: null };

        // Load preferences
        this.darkMode = localStorage.getItem('mf_darkMode') === 'true';
        this.animationsEnabled = localStorage.getItem('mf_animations') !== 'false';

        // Setup Date
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (document.getElementById('current-date')) {
            document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', dateOptions);
        }

        this.init();
    }

    loadUserData(username) {
        if (!username) return { vehicles: [], bills: [], clients: [], folders: [] };
        let parsed = { vehicles: [], bills: [], clients: [], folders: [] };

        try {
            const data = localStorage.getItem(`mf_data_${username}`);
            if (data) {
                const json = JSON.parse(data);
                if (json && typeof json === 'object') {
                    parsed = json;
                }
            }
        } catch (e) {
            console.error('Data corruption detected, resetting to empty', e);
        }

        // Schema migrations / Integrity checks
        if (!Array.isArray(parsed.vehicles)) parsed.vehicles = [];
        if (!Array.isArray(parsed.bills)) parsed.bills = [];
        if (!Array.isArray(parsed.clients)) parsed.clients = [];
        if (!Array.isArray(parsed.folders)) parsed.folders = [];

        return parsed;
    }

    init() {
        if (this.currentUser) {
            this.showApp();
        } else {
            this.setupAuthHandlers();
        }

        // Add Mobile Sidebar Overlay
        if (!document.querySelector('.sidebar-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.onclick = () => this.toggleSidebar();
            document.body.appendChild(overlay);
        }

        this.bindEvents();
        this.applyPreferences();

        // Guide new users if DB is empty
        if (this.users.length === 0 && !this.currentUser) {
            this.toast('Welcome! Please create a new account.', 'info');
        }
    }

    /* DATA LOGIC - FOLDERS */
    createFolder(type) {
        const name = prompt(`Enter Name for new ${type} folder:`);
        if (!name) return;

        const folder = {
            id: Date.now(),
            name: name,
            type: type // 'vehicles', 'clients', 'bills'
        };

        this.data.folders.push(folder);
        this.save();
        this.refreshCurrentView();
        this.toast('Folder created');
    }

    deleteFolder(id) {
        if (!confirm('Delete folder? Items inside will be moved to root.')) return;

        // Move items to root
        const folder = this.data.folders.find(f => f.id === id);
        if (!folder) return;

        if (folder.type === 'vehicles') {
            this.data.vehicles.forEach(v => { if (v.folderId === id) v.folderId = null; });
        } else if (folder.type === 'clients') {
            this.data.clients.forEach(c => { if (c.folderId === id) c.folderId = null; });
        } else if (folder.type === 'bills') {
            this.data.bills.forEach(b => { if (b.folderId === id) b.folderId = null; });
        }

        this.data.folders = this.data.folders.filter(f => f.id !== id);
        this.save();
        this.refreshCurrentView();
        this.toast('Folder deleted');
    }

    openFolder(type, id) {
        this.currentFolders[type] = id;
        this.refreshCurrentView();
    }

    refreshCurrentView() {
        // Helper to re-render based on current active view
        const activeView = document.querySelector('.view.active').id.replace('view-', '');
        this.navigate(activeView);
    }

    setupAuthHandlers() {
        const toggleBtn = document.getElementById('toggle-auth');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.isRegisterMode = !this.isRegisterMode;
                const btnText = document.getElementById('login-btn-text');
                const subtitle = document.getElementById('login-subtitle');
                const btn = document.getElementById('login-btn');
                const roleGroup = document.getElementById('role-group');

                if (this.isRegisterMode) {
                    btnText.innerText = 'Create Account';
                    subtitle.innerText = 'Register a new enterprise account';
                    toggleBtn.innerText = 'Back to Login';
                    btn.classList.replace('btn-primary', 'btn-success');
                    if (roleGroup) roleGroup.style.display = 'block';
                } else {
                    btnText.innerText = 'Secure Login';
                    subtitle.innerText = 'Enterprise Logistics & Billing System';
                    toggleBtn.innerText = 'Create Account';
                    btn.classList.replace('btn-success', 'btn-primary');
                    if (roleGroup) roleGroup.style.display = 'none';
                }
            });
        }
    }

    bindEvents() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('username').value.trim().toLowerCase();
            const p = document.getElementById('password').value;

            if (this.isRegisterMode) {
                this.register(u, p);
            } else {
                this.login(u, p);
            }
        });

        // Updated for new fields
        document.getElementById('vehicleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            this.addVehicle({
                id: Date.now(),
                customId: f.get('customId'),
                name: f.get('name'),
                type: f.get('type'),
                driver: f.get('driver'),
                driverPhone: f.get('driverPhone'),
                route: f.get('route'),
                status: f.get('status')
            });
        });

        document.getElementById('clientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            this.addClient({
                id: Date.now(),
                customId: f.get('customId'),
                name: f.get('name'),
                contact: f.get('contact'),
                phone: f.get('phone'),
                email: f.get('email'),
                status: f.get('status')
            });
        });

        document.getElementById('billForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const vId = document.getElementById('bill-vehicle-select').value;
            if (!vId) return this.toast('Select a vehicle first', 'error');

            // Gather services
            const services = [];
            document.querySelectorAll('.service-row').forEach(row => {
                const name = row.querySelector('.svc-name').value;
                const cost = parseFloat(row.querySelector('.svc-cost').value) || 0;
                if (name) services.push({ name, cost });
            });

            if (services.length === 0) return this.toast('Add at least one service', 'error');

            const billData = {
                vehicleId: parseInt(vId),
                client: document.getElementById('bill-client').value,
                date: document.getElementById('bill-date').value,
                services: services, // Array of objects
                currency: document.getElementById('bill-currency').value,
                additional: parseFloat(document.getElementById('bill-additional').value) || 0,
                total: parseFloat(document.getElementById('bill-total').value) || 0,
                notes: document.getElementById('bill-notes').value
            };

            // Check if we're editing (editingBillId is set) or creating new
            if (this.editingBillId) {
                billData.id = this.editingBillId;
                this.updateBill(billData);
            } else {
                billData.id = Date.now();
                this.addBill(billData);
            }
        });
    }

    /* AUTH & DATABASE */
    register(u, p) {
        if (u.length < 3) return this.toast('Username too short', 'error');
        if (p.length < 4) return this.toast('Password too weak', 'error');

        const existing = this.users.find(user => user.username === u);
        if (existing) return this.toast('Username already exists', 'error');

        const role = document.getElementById('user-role').value;
        const newUser = { username: u, password: p, role: role };
        this.users.push(newUser);
        localStorage.setItem('mf_users', JSON.stringify(this.users));

        // Initialize empty data for user
        localStorage.setItem(`mf_data_${u}`, JSON.stringify({ vehicles: [], bills: [] }));

        this.toast('Account created successfully!', 'success');
        this.login(u, p);
    }

    login(u, p) {
        const user = this.users.find(user => user.username === u && user.password === p);

        // Legacy Support with Role assignment
        if (!user && u === 'admin' && p === 'admin' && this.users.length === 0) {
            this.register('admin', 'admin');
            return;
        }

        if (user) {
            this.currentUser = u;
            this.currentRole = user.role || 'Admin';
            this.isSuperAdmin = (u === this.SUPER_ADMIN);

            localStorage.setItem('mf_current_user', u);
            localStorage.setItem('mf_current_role', this.currentRole);

            this.data = this.loadUserData(u);
            this.showApp();

            if (this.isSuperAdmin) {
                this.toast('Logged in as Super Admin', 'info');
            } else {
                this.toast(`Logged in as ${this.currentRole}`);
            }

            // Update profile UI
            const profileName = document.getElementById('user-display-name');
            const profileRole = document.getElementById('user-display-role');
            const avatar = document.getElementById('user-avatar');

            if (profileName) profileName.innerText = u.charAt(0).toUpperCase() + u.slice(1);
            if (profileRole) {
                if (this.isSuperAdmin) {
                    profileRole.innerHTML = '<span style="color:#4F46E5; font-weight:700">Super Admin</span>';
                } else {
                    profileRole.innerText = this.currentRole === 'Admin' ? 'Administrator' :
                        this.currentRole === 'FleetManager' ? 'Fleet Manager' :
                            this.currentRole === 'BillingOfficer' ? 'Billing Officer' : 'Auditor';
                }
            }
            if (avatar) avatar.innerText = u.slice(0, 2).toUpperCase();
        } else {
            // Detailed error messages
            const existingUser = this.users.find(user => user.username === u);
            if (!existingUser) {
                if (this.users.length === 0) {
                    this.toast('No users found. Please create an account.', 'info');
                } else {
                    this.toast('Username not found', 'error');
                }
            } else {
                this.toast('Incorrect password', 'error');
            }
        }
    }

    togglePasswordVisibility() {
        const input = document.getElementById('password');
        const icon = document.getElementById('toggle-password');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('ph-eye-slash', 'ph-eye');
        } else {
            input.type = 'password';
            icon.classList.replace('ph-eye', 'ph-eye-slash');
        }
    }

    logout() {
        localStorage.removeItem('mf_current_user');
        localStorage.removeItem('mf_current_role');
        window.location.reload();
    }

    showApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';

        // Ensure role and super status are loaded
        this.currentUser = localStorage.getItem('mf_current_user');
        this.currentRole = localStorage.getItem('mf_current_role') || 'Admin';
        this.isSuperAdmin = (this.currentUser === this.SUPER_ADMIN);

        this.navigate('dashboard');
        this.updateStats();
        this.enforcePermissions();
    }

    calcTotal() {
        let total = 0;
        // Sum Services
        document.querySelectorAll('.svc-cost').forEach(inp => {
            total += parseFloat(inp.value) || 0;
        });

        // Subtract Additional (as requested)
        const add = parseFloat(document.getElementById('bill-additional').value) || 0;
        total -= add;

        document.getElementById('bill-total').value = total.toFixed(2);
    }

    addServiceRow() {
        const container = document.getElementById('service-list-container');
        const div = document.createElement('div');
        div.className = 'service-row';
        div.innerHTML = `
            <input type="text" class="form-control svc-name" placeholder="Service name" required>
            <input type="number" class="form-control svc-cost" placeholder="Cost" step="0.01" oninput="app.calcTotal()" required>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove(); app.calcTotal()">
                <i class="ph ph-trash"></i>
            </button>
        `;
        container.appendChild(div);
    }

    updateCurrencyLabel() {
        const curr = document.getElementById('bill-currency').value;
        const badge = document.getElementById('total-currency-badge');
        if (badge) badge.innerText = curr;

        // Update placeholders if needed, currently generic
    }

    /* NAV */
    navigate(view) {
        // Role Access Control
        if (this.currentRole === 'BillingOfficer' && view === 'vehicles') {
            return this.toast('Billing Officers cannot access Fleet Management', 'error');
        }

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('active');
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay) overlay.classList.remove('active');
        }

        // Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[onclick*="${view}"]`);
        if (activeNav) activeNav.classList.add('active');

        // Page Title
        const titles = {
            dashboard: 'Dashboard',
            vehicles: 'Fleet Management',
            bills: 'Billing & Invoices',
            clients: 'Client Management',
            users: 'User Management'
        };
        document.getElementById('page-title').innerText = titles[view];

        // RENDER FOLDERS AND BREADCRUMBS
        if (['vehicles', 'clients', 'bills'].includes(view)) {
            this.renderFolders(view);
        }

        if (view === 'vehicles') this.renderVehicles();
        if (view === 'clients') this.renderClients();
        if (view === 'bills') {
            this.renderBills();
            // Initialize with one row if empty
            const container = document.getElementById('service-list-container');
            if (container && container.children.length === 0) {
                this.addServiceRow();
            }
        }
        if (view === 'users') this.renderUserManagement();

        this.enforcePermissions();
    }

    enforcePermissions() {
        const role = this.currentRole;

        // Super Admin overrides everything
        if (this.isSuperAdmin) {
            document.querySelectorAll('.nav-item').forEach(n => n.style.display = 'flex');
            document.querySelectorAll('button').forEach(b => {
                b.style.display = '';
                b.style.opacity = '1';
                b.style.pointerEvents = 'all';
            });
            document.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
            return;
        }

        // 1. Hide Fleet Management for Billing Officer
        const fleetNavItem = document.querySelector('.nav-item[onclick*="vehicles"]');
        if (fleetNavItem) {
            fleetNavItem.style.display = (role === 'BillingOfficer') ? 'none' : 'flex';
        }

        // 2. Disable Settings for non-admins
        const settingsBtn = document.querySelector('button[onclick*="settingsModal"]');
        if (settingsBtn) {
            settingsBtn.style.display = (role === 'Admin') ? 'block' : 'none';
        }

        // 3. Auditor Mode (Read-Only)
        if (role === 'Auditor') {
            document.querySelectorAll('button.btn-primary, button.btn-danger, button.btn-success').forEach(btn => {
                // Keep print button enabled for Auditor
                if (!btn.onclick?.toString().includes('reprintBill') && !btn.onclick?.toString().includes('printBill')) {
                    btn.style.opacity = '0.5';
                    btn.style.pointerEvents = 'none';
                }
            });
            document.querySelectorAll('input, select, textarea').forEach(el => {
                el.disabled = true;
            });
        }
    }

    // NEW: Render Folders Logic
    renderFolders(type) {
        const gridId = `${type}-folders`;
        const container = document.getElementById(gridId);
        const breadcrumbId = `${type}-breadcrumb`;
        const breadcrumbContainer = document.getElementById(breadcrumbId);

        if (!container) return; // UI element might not exist yet if not updated

        // 1. Render Breadcrumbs
        const currentFolderId = this.currentFolders[type];
        let breadcrumbHtml = `
            <div class="breadcrumb-item ${currentFolderId ? '' : 'active'}" onclick="app.openFolder('${type}', null)">
                <i class="ph ph-house"></i> Root
            </div>
        `;

        if (currentFolderId) {
            const folder = this.data.folders.find(f => f.id === currentFolderId);
            if (folder) {
                breadcrumbHtml += `
                    <div class="breadcrumb-separator">/</div>
                    <div class="breadcrumb-item active">${folder.name}</div>
                 `;
            }
        }
        if (breadcrumbContainer) breadcrumbContainer.innerHTML = breadcrumbHtml;

        // 2. Render Folders (Only show if we are in Root, or maybe subfolders later)
        // For now, flat structure: show folders in Root. If inside folder, don't show other folders?
        // Better: Show folders only when in Root.

        if (currentFolderId) {
            container.style.display = 'none'; // Hide folders grid when inside a folder
            return;
        } else {
            container.style.display = 'grid';
        }

        const folders = this.data.folders.filter(f => f.type === type);
        container.innerHTML = folders.map(f => {
            // Count items
            let count = 0;
            if (type === 'vehicles') count = this.data.vehicles.filter(v => v.folderId === f.id).length;
            if (type === 'clients') count = this.data.clients.filter(c => c.folderId === f.id).length;
            if (type === 'bills') count = this.data.bills.filter(b => b.folderId === f.id).length;

            return `
            <div class="folder-card" onclick="app.openFolder('${type}', ${f.id})">
                <div class="folder-actions">
                    <button class="btn btn-icon btn-sm btn-danger" 
                        onclick="event.stopPropagation(); app.deleteFolder(${f.id})" title="Delete Folder">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
                <div class="folder-icon"><i class="ph ph-folder-fill"></i></div>
                <div class="folder-name">${f.name}</div>
                <div class="folder-count">${count} items</div>
            </div>
            `;
        }).join('');
    }

    /* DATA LOGIC (Modified to support folders) */
    addVehicle(v) {
        // Assign to current folder if any
        v.folderId = this.currentFolders.vehicles;

        this.data.vehicles.push(v);
        this.save();
        this.closeModal('vehicleModal');
        this.renderVehicles();
        this.renderFolders('vehicles'); // Update count
        this.updateStats();
        this.toast('Vehicle added successfully');
        this.logActivity('New Vehicle', `Registered ${v.name} (${v.customId})`);
    }

    addClient(c) {
        c.folderId = this.currentFolders.clients;

        this.data.clients.push(c);
        this.save();
        this.closeModal('clientModal');
        this.renderClients();
        this.renderFolders('clients');
        this.updateStats();
        this.toast('Client added successfully');
        this.logActivity('New Client', `Registered ${c.name} (${c.contact})`);
    }

    // ... deleteClient/Vehicle ... needs to update Folder Counts
    deleteClient(id) {
        if (!confirm('Are you sure?')) return;
        this.data.clients = this.data.clients.filter(c => c.id !== id);
        this.save();
        this.renderClients();
        this.renderFolders('clients');
        this.updateStats();
        this.toast('Client removed');
    }

    deleteVehicle(id) {
        if (!confirm('Are you sure?')) return;
        this.data.vehicles = this.data.vehicles.filter(v => v.id !== id);
        this.save();
        this.renderVehicles();
        this.renderFolders('vehicles');
        this.updateStats();
        this.toast('Vehicle removed');
    }

    // ... deleteBill ...
    deleteBill(id) {
        if (!confirm('Are you sure you want to delete this invoice?')) return;
        this.data.bills = this.data.bills.filter(b => b.id !== id);
        this.save();
        this.renderBills();
        this.renderFolders('bills');
        this.updateStats();
        this.toast('Invoice deleted successfully');
    }

    addBill(bill) {
        bill.folderId = this.currentFolders.bills;

        this.data.bills.unshift(bill);
        this.save();
        this.renderBills();
        this.renderFolders('bills');
        this.updateStats();
        this.logActivity('Invoice Generated', `${bill.currency} ${bill.total.toFixed(2)} for ${bill.vehicleId}`);
        this.resetBillForm();
        this.printBill(bill);
    }

    // UPDATE RENDER METHODS TO FILTER
    renderVehicles() {
        const currentFolderId = this.currentFolders.vehicles;
        // Filter: If folder selected, show only matching. If root (null), show only those with null/undefined folderId
        const list = this.data.vehicles.filter(v =>
            currentFolderId ? v.folderId === currentFolderId : !v.folderId
        );

        const tbody = document.getElementById('vehicle-list-body');
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999; padding:2rem;">No vehicles in this folder</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(v => `
            <tr>
                <td style="font-weight:600">${v.customId || '-'}</td>
                <td>
                    <div style="font-weight:600">${v.name}</div>
                </td>
                <td>
                    <span class="badge" style="background:#f1f5f9; color:#475569">${v.type || 'Truck'}</span>
                </td>
                <td>
                    <div>${v.driver}</div>
                    <div style="font-size:0.8rem; color:#64748b">${v.driverPhone || ''}</div>
                </td>
                <td>${v.route || '-'}</td>
                <td><span class="badge ${v.status === 'Active' ? 'badge-success' : 'badge-warning'}">${v.status}</span></td>
                <td class="text-right">
                    <button class="btn btn-icon btn-sm btn-danger" onclick="app.deleteVehicle(${v.id})" title="Delete Vehicle">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    renderClients() {
        const currentFolderId = this.currentFolders.clients;
        const list = this.data.clients.filter(c =>
            currentFolderId ? c.folderId === currentFolderId : !c.folderId
        );

        const tbody = document.getElementById('client-list-body');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999; padding:2rem;">No clients in this folder</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(c => `
            <tr>
                <td style="font-weight:600">${c.customId || '-'}</td>
                <td>
                    <div style="font-weight:600">${c.name}</div>
                </td>
                <td>${c.contact}</td>
                <td>${c.phone}</td>
                <td>${c.email}</td>
                <td><span class="badge ${c.status === 'Active' ? 'badge-success' : 'badge-warning'}">${c.status}</span></td>
                <td class="text-right">
                    <button class="btn btn-icon btn-sm btn-danger" onclick="app.deleteClient(${c.id})" title="Delete Client">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    renderBills() {
        // Render Select (Unchanged)
        const sel = document.getElementById('bill-vehicle-select');
        sel.innerHTML = '<option value="">-- Select Vehicle --</option>' +
            this.data.vehicles.map(v => `<option value="${v.id}">${v.name} (${v.customId})</option>`).join('');

        const clientSel = document.getElementById('bill-client');
        if (clientSel) {
            clientSel.innerHTML = '<option value="">Select a client</option>' +
                '<option value="Direct">Direct Customer</option>' +
                this.data.clients.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }

        // Render History (FILTERED)
        const currentFolderId = this.currentFolders.bills;
        const list = this.data.bills.filter(b =>
            currentFolderId ? b.folderId === currentFolderId : !b.folderId
        );

        const tbody = document.getElementById('bill-history-list');

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999; padding:2rem;">No invoices in this folder</td></tr>';
            return;
        }

        tbody.innerHTML = list.slice(0, 10).map(b => {
            const v = this.data.vehicles.find(veh => veh.id === b.vehicleId) || { name: 'Unknown', customId: '?' };
            // Fallbacks
            const curr = b.currency || 'USD';
            const amt = b.total || b.amount || 0;
            // Handle service description for history view - join names if array, else string
            let desc = '-';
            if (Array.isArray(b.services)) {
                desc = b.services.map(s => s.name).join(', ');
            } else {
                desc = b.services || b.desc || '-';
            }

            return `
                <tr>
                    <td style="font-family:monospace">#${b.id.toString().slice(-6)}</td>
                    <td>${v.name} (${v.customId})</td>
                    <td><div style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${desc}</div></td>
                    <td>${b.date}</td>
                    <td style="font-weight:600">${curr} ${amt.toFixed(2)}</td>
                    <td class="text-right">
                        <button class="btn btn-icon btn-sm btn-success" style="margin-right: 0.5rem;" onclick="app.reprintBill(${b.id})" title="Print Invoice">
                            <i class="ph ph-printer"></i>
                        </button>
                        <button class="btn btn-icon btn-sm btn-primary" style="margin-right: 0.5rem;" onclick="app.editBill(${b.id})" title="Edit Invoice">
                            <i class="ph ph-pencil-simple"></i>
                        </button>
                        <button class="btn btn-icon btn-sm btn-danger" onclick="app.deleteBill(${b.id})" title="Delete Invoice">
                            <i class="ph ph-trash"></i>
                        </button>
                    </td>
                </tr>
             `;
        }).join('');
    }

    printBill(bill) {
        const v = this.data.vehicles.find(veh => veh.id === bill.vehicleId) || { name: '?', customId: '?', driver: '?', type: '?' };
        const curr = bill.currency || 'USD';

        document.getElementById('p-id').innerText = '#INV-' + bill.id.toString().slice(-6);
        document.getElementById('p-date').innerText = bill.date;
        document.getElementById('p-vehicle-title').innerText = `${v.name} - ${v.customId} (${v.type || 'Vehicle'})`;
        document.getElementById('p-driver').innerText = v.driver;

        // Render Services in Print Table
        // We need to inject rows into the print table tbody
        // The original template had fixed rows, we need to clear and rebuild
        const pTbody = document.querySelector('#print-area tbody');
        if (pTbody) {
            let html = '';
            if (Array.isArray(bill.services)) {
                bill.services.forEach(s => {
                    html += `
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${s.name}</td>
                            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${curr} ${parseFloat(s.cost).toFixed(2)}</td>
                        </tr>
                    `;
                });
            } else {
                // Legacy string support
                html += `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${bill.services || '-'}</td>
                        <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${curr} ${(bill.baseCost || 0).toFixed(2)}</td>
                    </tr>
                `;
            }

            // Additional Charge Row
            if (bill.additional > 0) {
                html += `
                    <tr>
                        <td style="padding: 10px; text-align: right; font-weight: 600;">Additional Charge (Deduction)</td>
                        <td style="padding: 10px; text-align: right;">- ${curr} ${bill.additional.toFixed(2)}</td>
                    </tr>
                `;
            }

            pTbody.innerHTML = html;
        }

        document.getElementById('p-notes').innerText = bill.notes || '-';
        document.getElementById('p-total').innerText = `${curr} ${bill.total.toFixed(2)}`;

        // Set signature date
        const signatureDate = document.getElementById('p-signature-date');
        if (signatureDate) {
            signatureDate.innerText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }

        setTimeout(() => window.print(), 500);
    }

    updateStats() {
        document.getElementById('stat-vehicles').innerText = this.data.vehicles.length;
        document.getElementById('stat-bills').innerText = this.data.bills.length;
        const clientStat = document.getElementById('stat-clients');
        if (clientStat) clientStat.innerText = this.data.clients.length;
    }

    logActivity(type, msg) {
        const list = document.getElementById('activity-list');
        const row = `
            <tr>
                <td><span class="badge" style="background:#f3f4f6">${type}</span></td>
                <td>${msg}</td>
                <td style="font-size:0.8rem; color:#888">${new Date().toLocaleTimeString()}</td>
            </tr>
        `;
        list.insertAdjacentHTML('afterbegin', row);
    }

    /* DATABASE UTILS */
    save() {
        if (!this.currentUser) return;
        localStorage.setItem(`mf_data_${this.currentUser}`, JSON.stringify({
            vehicles: this.data.vehicles,
            bills: this.data.bills,
            clients: this.data.clients,
            folders: this.data.folders
        }));
    }

    toast(msg, type = 'success') {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = 'toast';

        let color = '#10b981'; // success
        let icon = 'check-circle';

        if (type === 'error') {
            color = '#ef4444';
            icon = 'warning-circle';
        } else if (type === 'info') {
            color = '#3b82f6';
            icon = 'info';
        }

        t.style.borderLeftColor = color;
        t.innerHTML = `
            <i class="ph ph-${icon}" style="color:${color}; font-size: 1.2rem"></i>
            <span>${msg}</span>
        `;
        c.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(20px)';
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    openModal(id) {
        document.getElementById(id).classList.add('active');
        if (id === 'settingsModal') {
            this.updateDatabaseStats();
            if (this.isSuperAdmin) this.renderUserManagement();
        }
    }

    renderUserManagement() {
        const section = document.getElementById('super-admin-section');
        const tbody = document.getElementById('user-management-list');
        if (!section || !tbody) return;

        section.style.display = 'block';

        tbody.innerHTML = this.users.map(u => {
            if (u.username === this.SUPER_ADMIN) return ''; // Hide self from editing
            return `
                <tr>
                    <td style="font-weight:600">${u.username}</td>
                    <td>
                        <select class="form-control" style="font-size: 0.75rem; padding: 2px 5px; height: auto;" 
                                onchange="app.changeUserRole('${u.username}', this.value)">
                            <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                            <option value="FleetManager" ${u.role === 'FleetManager' ? 'selected' : ''}>FleetManager</option>
                            <option value="BillingOfficer" ${u.role === 'BillingOfficer' ? 'selected' : ''}>BillingOfficer</option>
                            <option value="Auditor" ${u.role === 'Auditor' ? 'selected' : ''}>Auditor</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    }

    changeUserRole(username, newRole) {
        const user = this.users.find(u => u.username === username);
        if (user) {
            user.role = newRole;
            localStorage.setItem('mf_users', JSON.stringify(this.users));
            this.toast(`Role updated for ${username}`, 'success');
        }
    }

    updateDatabaseStats() {
        const statsSection = document.getElementById('db-stats');
        if (!statsSection) return;

        const dataStr = localStorage.getItem(`mf_data_${this.currentUser}`) || '';
        const sizeKB = (dataStr.length / 1024).toFixed(2);

        statsSection.innerHTML = `
            <div style="background: var(--bg-body); padding: 1rem; border-radius: 8px; font-size: 0.85rem; border: 1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary)">Current Workspace:</span>
                    <span style="font-weight: 600;">${this.currentUser}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary)">Database Size:</span>
                    <span>${sizeKB} KB</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="color: var(--text-secondary)">Total Objects:</span>
                    <span>${this.data.vehicles.length + this.data.bills.length}</span>
                </div>
            </div>
        `;
    }

    toggleSidebar() {
        document.querySelector('.sidebar').classList.toggle('active');
        document.querySelector('.sidebar-overlay').classList.toggle('active');
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    /* SETTINGS & PREFERENCES */
    applyPreferences() {
        // Apply dark mode
        if (this.darkMode) {
            document.body.classList.add('dark-mode');
            const toggle = document.getElementById('darkmode-toggle');
            if (toggle) toggle.innerHTML = '<i class="ph ph-sun"></i>';
        }

        // Apply animations setting
        if (!this.animationsEnabled) {
            document.body.classList.add('no-animations');
        }

        // Update checkboxes in settings modal
        const darkModeCheckbox = document.getElementById('darkmode-checkbox');
        const animationsCheckbox = document.getElementById('animations-checkbox');
        if (darkModeCheckbox) darkModeCheckbox.checked = this.darkMode;
        if (animationsCheckbox) animationsCheckbox.checked = this.animationsEnabled;
    }

    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        localStorage.setItem('mf_darkMode', this.darkMode);

        document.body.classList.toggle('dark-mode');

        // Update button icon
        const toggle = document.getElementById('darkmode-toggle');
        if (toggle) {
            toggle.innerHTML = this.darkMode ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
        }

        // Update checkbox
        const checkbox = document.getElementById('darkmode-checkbox');
        if (checkbox) checkbox.checked = this.darkMode;

        this.toast(this.darkMode ? 'Dark mode enabled' : 'Light mode enabled');
    }

    toggleAnimations() {
        this.animationsEnabled = !this.animationsEnabled;
        localStorage.setItem('mf_animations', this.animationsEnabled);

        if (this.animationsEnabled) {
            document.body.classList.remove('no-animations');
            this.toast('Animations enabled');
        } else {
            document.body.classList.add('no-animations');
            this.toast('Animations disabled');
        }
    }

    clearAllData() {
        if (!confirm('Are you sure you want to delete ALL vehicles and invoices? This cannot be undone!')) return;

        this.data.vehicles = [];
        this.data.bills = [];
        localStorage.removeItem('vehicles');
        localStorage.removeItem('bills');

        this.renderVehicles();
        this.renderBills();
        this.updateStats();
        this.closeModal('settingsModal');

        this.toast('All data cleared successfully');
    }
}

window.app = new App();
