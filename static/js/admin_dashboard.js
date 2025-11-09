// Admin Dashboard JavaScript

// Function to show notifications
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the dashboard
    initializeDashboard();
    
    // Set up menu navigation
    setupMenuNavigation();
    
    // Initial data fetch
    fetchApiStatus();
    fetchSystemStats();
    fetchActiveEvents();
    
    // Set up refresh buttons
    document.getElementById('refresh-dashboard').addEventListener('click', function(e) {
        e.preventDefault();
        refreshDashboard();
    });
    
    if (document.getElementById('refresh-markets')) {
        document.getElementById('refresh-markets').addEventListener('click', function(e) {
            e.preventDefault();
            fetchActiveEvents();
            
            // Animate refresh button
            this.classList.add('spin');
            setTimeout(() => {
                this.classList.remove('spin');
            }, 1000);
        });
    }
    
    // Auto-refresh every 30 seconds
    setInterval(refreshDashboard, 30000);
    
    // Update last refresh time
    updateLastRefreshTime();
});

// Initialize dashboard
function initializeDashboard() {
    console.log('Admin Dashboard Initialized');
    
    // Set up user management functionality
    setupUserManagement();
    
    // Set up create admin modal
    setupCreateAdminModal();
    
    // Fetch initial user stats
    fetchUserStats();
}

// Set up menu navigation
function setupMenuNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-nav li');
    const contentPages = document.querySelectorAll('.content-page');
    const pageTitle = document.getElementById('page-title');
    
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            
            // Update active menu item
            menuItems.forEach(item => item.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding content page
            contentPages.forEach(contentPage => {
                if (contentPage.id === `${page}-page`) {
                    contentPage.classList.add('active');
                } else {
                    contentPage.classList.remove('active');
                }
            });
            
            // Update page title
            pageTitle.textContent = page.charAt(0).toUpperCase() + page.slice(1);
        });
    });
}

// Refresh all dashboard data
function refreshDashboard() {
    fetchApiStatus();
    fetchSystemStats();
    fetchActiveEvents();
    fetchUserStats(); // Add user stats fetch
    updateLastRefreshTime();
    
    // Animate refresh button
    const refreshBtn = document.getElementById('refresh-dashboard');
    refreshBtn.classList.add('spin');
    setTimeout(() => {
        refreshBtn.classList.remove('spin');
    }, 1000);
}

// Fetch API connection status
function fetchApiStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            updateConnectionStatus('betfair-status', data.betfair_connected);
            updateConnectionStatus('database-status', data.database_connected);
            
            // Update session info if present
            const sessionElement = document.getElementById('session-info');
            if (sessionElement) {
                if (data.session_valid) {
                    const expiryTime = new Date(data.session_expiry);
                    const now = new Date();
                    const diffMs = expiryTime - now;
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    sessionElement.innerHTML = `
                        <div class="status-indicator">
                            <div class="dot connected"></div>
                            <span class="status-text">Session Active</span>
                        </div>
                        <div>Expires in: ${diffHrs}h ${diffMins}m</div>
                    `;
                } else {
                    sessionElement.innerHTML = `
                        <div class="status-indicator">
                            <div class="dot disconnected"></div>
                            <span class="status-text">Session Inactive</span>
                        </div>
                        <div>Login required</div>
                    `;
                }
            }
        })
        .catch(error => {
            console.error('Error fetching API status:', error);
            updateConnectionStatus('betfair-status', false);
            updateConnectionStatus('database-status', false);
        });
}

// Update connection status indicators
function updateConnectionStatus(elementId, isConnected) {
    const element = document.getElementById(elementId);
    if (element) {
        const statusDot = element.querySelector('.dot');
        const statusText = element.querySelector('.status-text');
        
        if (isConnected) {
            statusDot.className = 'dot connected';
            if (statusText && statusText.textContent.indexOf('API') === -1 && 
                statusText.textContent.indexOf('Database') === -1) {
                statusText.textContent = 'Connected';
            }
        } else {
            statusDot.className = 'dot disconnected';
            if (statusText && statusText.textContent.indexOf('API') === -1 && 
                statusText.textContent.indexOf('Database') === -1) {
                statusText.textContent = 'Disconnected';
            }
        }
    }
}

// Fetch system statistics
function fetchSystemStats() {
    fetch('/api/stats')
        .then(response => response.json())
        .then(data => {
            // Update request stats
            updateElementText('total-requests', data.total_requests);
            updateElementText('requests-per-minute', data.requests_per_minute);
            
            // Update market stats
            updateElementText('active-markets', data.active_markets);
            updateElementText('total-matched', data.total_matched.toLocaleString());
        })
        .catch(error => {
            console.error('Error fetching system stats:', error);
        });
}

// Fetch user statistics
function fetchUserStats() {
    // Get auth token from local storage
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('No auth token found for fetching user stats');
        return;
    }
    
    // Fetch user stats from API
    fetch('/api/user_management/dashboard/stats', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('User stats data:', data);
        
        // Update user counts on dashboard
        if (data.user_counts) {
            updateElementText('admin-count', data.user_counts.admin || 0);
            updateElementText('super-master-count', data.user_counts.super_master || 0);
            updateElementText('master-count', data.user_counts.master || 0);
            updateElementText('user-count', data.user_counts.user || 0);
        }
    })
    .catch(error => {
        console.error('Error fetching user stats:', error);
    });
}

// Helper function to update element text if it exists
function updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

// Fetch active events data with loading indicator
function fetchActiveEvents() {
    // Show loading indicators
    const eventsTable = document.querySelector('.events-table tbody');
    const sportsBreakdown = document.getElementById('sports-breakdown');
    const marketsAccordion = document.getElementById('markets-accordion');
    
    if (eventsTable) eventsTable.innerHTML = '<tr><td colspan="4">Loading events...</td></tr>';
    if (marketsAccordion) marketsAccordion.innerHTML = '<div class="loading-message">Loading markets...</div>';
    
    // Use a timeout to prevent UI freezing
    setTimeout(() => {
        fetch('/api/events/active')
            .then(response => response.json())
            .then(data => {
                // Update events first (faster to render)
                updateEventsTable(data.events);
                updateSportsBreakdown(data.sports_breakdown);
                
                // Store markets data for lazy loading
                window.marketsData = data.markets;
                
                // Only initialize markets if we're on the Dashboard tab
                const activeTab = document.querySelector('.menu-item.active');
                if (activeTab && activeTab.getAttribute('data-page') === 'dashboard') {
                    // Lazy load markets with a small delay to improve perceived performance
                    setTimeout(() => {
                        updateMarketsTable(window.marketsData);
                        setupSportFilter(window.marketsData);
                    }, 100);
                }
            })
            .catch(error => {
                console.error('Error fetching active events:', error);
                if (eventsTable) eventsTable.innerHTML = '<tr><td colspan="4">Error loading events</td></tr>';
                if (marketsAccordion) marketsAccordion.innerHTML = '<div class="error-message">Error loading markets</div>';
            });
    }, 10);
}

// Setup sport filter functionality
function setupSportFilter(markets) {
    const sportFilter = document.getElementById('sport-filter');
    if (!sportFilter) return;
    
    sportFilter.addEventListener('change', function() {
        const selectedSport = this.value;
        
        if (selectedSport === 'all') {
            // Show all sports
            updateMarketsTable(markets);
        } else {
            // Filter markets by selected sport
            const filteredMarkets = markets.filter(market => market.sport === selectedSport);
            updateMarketsTable(filteredMarkets);
        }
    });
}

// Update events list
function updateEventsList(events) {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;
    
    eventsList.innerHTML = '';
    
    if (!events || events.length === 0) {
        eventsList.innerHTML = '<li>No active events found</li>';
        return;
    }
    
    events.forEach(event => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="event-title">${event.name}</div>
            <div class="event-meta">
                ${event.type} | ${event.start_time} | Markets: ${event.market_count}
            </div>
        `;
        eventsList.appendChild(li);
    });
}

// Update sports breakdown
function updateSportsBreakdown(sportsData) {
    const sportsContainer = document.getElementById('sports-breakdown');
    if (!sportsContainer) return;
    
    sportsContainer.innerHTML = '';
    
    if (!sportsData || Object.keys(sportsData).length === 0) {
        sportsContainer.innerHTML = '<div>No sports data available</div>';
        return;
    }
    
    for (const sport in sportsData) {
        const sportDiv = document.createElement('div');
        sportDiv.className = 'sport-item';
        sportDiv.innerHTML = `
            <span class="sport-name">${sport}</span>
            <span class="sport-count">${sportsData[sport]}</span>
        `;
        sportsContainer.appendChild(sportDiv);
    }
}

// Function to update markets with grouping by Sports ID and Market ID
function updateMarketsTable(markets) {
    const marketsAccordion = document.getElementById('markets-accordion');
    if (!marketsAccordion) return;
    
    // Clear existing content
    marketsAccordion.innerHTML = '';
    
    if (markets && markets.length > 0) {
        // Group markets by sport
        const sportGroups = {};
        
        markets.forEach(market => {
            const sportName = market.sport;
            if (!sportGroups[sportName]) {
                sportGroups[sportName] = {
                    name: sportName,
                    events: {}
                };
            }
            
            // Group by event within each sport
            const eventName = market.event_name;
            if (!sportGroups[sportName].events[eventName]) {
                sportGroups[sportName].events[eventName] = {
                    name: eventName,
                    markets: []
                };
            }
            
            // Add market to this event group
            sportGroups[sportName].events[eventName].markets.push(market);
        });
        
        // Create accordion elements for each sport group
        Object.values(sportGroups).forEach((sport, sportIndex) => {
            const sportGroup = document.createElement('div');
            sportGroup.className = 'sport-group';
            sportGroup.id = `sport-${sportIndex}`;
            
            // Create sport header
            const sportHeader = document.createElement('div');
            sportHeader.className = 'sport-header';
            sportHeader.innerHTML = `
                <span>${sport.name}</span>
                <span class="toggle-icon"><i class="fas fa-chevron-down"></i></span>
            `;
            sportHeader.addEventListener('click', () => toggleSportContent(sportIndex));
            
            // Create sport content container
            const sportContent = document.createElement('div');
            sportContent.className = 'sport-content';
            sportContent.id = `sport-content-${sportIndex}`;
            
            // Create event groups within this sport
            Object.values(sport.events).forEach((event, eventIndex) => {
                const eventGroup = document.createElement('div');
                eventGroup.className = 'event-group';
                eventGroup.id = `event-${sportIndex}-${eventIndex}`;
                
                // Create event header
                const eventHeader = document.createElement('div');
                eventHeader.className = 'event-header';
                eventHeader.innerHTML = `
                    <span>${event.name}</span>
                    <span class="toggle-icon"><i class="fas fa-chevron-down"></i></span>
                `;
                eventHeader.addEventListener('click', () => toggleEventContent(sportIndex, eventIndex));
                
                // Create event content with markets table
                const eventContent = document.createElement('div');
                eventContent.className = 'event-content';
                eventContent.id = `event-content-${sportIndex}-${eventIndex}`;
                
                // Create markets table
                const table = document.createElement('table');
                table.className = 'markets-table';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Market</th>
                            <th>Start Time</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                
                // Add market rows
                const tbody = table.querySelector('tbody');
                event.markets.forEach(market => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${market.name}</td>
                        <td>${market.start_time}</td>
                        <td>
                            <span class="badge ${market.status === 'OPEN' ? 'badge-success' : 'badge-warning'}">
                                ${market.status}
                            </span>
                        </td>
                        <td>
                            <a href="/api/Markets/catalog2?id=${market.id}" target="_blank" class="action-btn">
                                <i class="fas fa-eye"></i>
                            </a>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
                
                eventContent.appendChild(table);
                eventGroup.appendChild(eventHeader);
                eventGroup.appendChild(eventContent);
                sportContent.appendChild(eventGroup);
            });
            
            sportGroup.appendChild(sportHeader);
            sportGroup.appendChild(sportContent);
            marketsAccordion.appendChild(sportGroup);
        });
        
        // Open the first sport by default
        if (Object.keys(sportGroups).length > 0) {
            toggleSportContent(0);
        }
    } else {
        marketsAccordion.innerHTML = '<div class="no-markets-message">No markets data available</div>';
    }
}

// Toggle sport content visibility
function toggleSportContent(sportIndex) {
    const sportHeader = document.querySelector(`#sport-${sportIndex} .sport-header`);
    const sportContent = document.getElementById(`sport-content-${sportIndex}`);
    
    if (sportContent.classList.contains('active')) {
        sportContent.classList.remove('active');
        sportHeader.classList.add('collapsed');
    } else {
        sportContent.classList.add('active');
        sportHeader.classList.remove('collapsed');
    }
}

// Toggle event content visibility
function toggleEventContent(sportIndex, eventIndex) {
    const eventHeader = document.querySelector(`#event-${sportIndex}-${eventIndex} .event-header`);
    const eventContent = document.getElementById(`event-content-${sportIndex}-${eventIndex}`);
    
    if (eventContent.classList.contains('active')) {
        eventContent.classList.remove('active');
        eventHeader.classList.add('collapsed');
    } else {
        eventContent.classList.add('active');
        eventHeader.classList.remove('collapsed');
    }
}

// Update last refresh time
function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const lastRefreshElement = document.getElementById('last-refresh');
    if (lastRefreshElement) {
        lastRefreshElement.textContent = timeString;
    }
}

// Set up user management functionality
function setupUserManagement() {
    // Set up role filter change handler
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
        roleFilter.addEventListener('change', function() {
            fetchUsers(this.value);
        });
    }
    
    // Set up refresh users button
    const refreshUsersBtn = document.getElementById('refresh-users');
    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fetchUsers(document.getElementById('role-filter').value);
            
            // Animate refresh button
            this.classList.add('spin');
            setTimeout(() => {
                this.classList.remove('spin');
            }, 1000);
        });
    }
    
    // Set up add user button
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Show add user modal or redirect to add user page
            alert('Add user functionality will be implemented here');
        });
    }
}

// Show user management page with filtered data
function showUserManagement(role) {
    // Navigate to users page
    const menuItems = document.querySelectorAll('.sidebar-nav li');
    const contentPages = document.querySelectorAll('.content-page');
    const pageTitle = document.getElementById('page-title');
    
    // Update active menu item
    menuItems.forEach(item => item.classList.remove('active'));
    const usersMenuItem = document.querySelector('.sidebar-nav li[data-page="users"]');
    if (usersMenuItem) {
        usersMenuItem.classList.add('active');
    }
    
    // Show users content page
    contentPages.forEach(contentPage => {
        if (contentPage.id === 'users-page') {
            contentPage.classList.add('active');
        } else {
            contentPage.classList.remove('active');
        }
    });
    
    // Update page title
    if (pageTitle) {
        pageTitle.textContent = 'User Management';
    }
    
    // Set the role filter
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
        roleFilter.value = role;
    }
    
    // Fetch users with the selected role
    fetchUsers(role);
}

// Fetch users data from API
function fetchUsers(role = 'all') {
    // Show loading indicator
    const tableBody = document.getElementById('users-table-body');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading users data...</td></tr>';
    }
    
    // Get auth token from local storage
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.error('No auth token found for fetching users');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Authentication error. Please log in again.</td></tr>';
        }
        return;
    }
    
    // Fetch users from API with auth token
    fetch(`/api/users?role=${role}`, { 
        method: "GET", 
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        } 
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        updateUsersTable(data.users);
    })
    .catch(error => {
        console.error('Error fetching users:', error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Error loading users data. Please try again.</td></tr>';
        }
    });
}

// Update users table with data
function updateUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    
    if (!users || users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
        return;
    }
    
    // Clear table
    tableBody.innerHTML = '';
    
    // Add user rows
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.full_name || '-'}</td>
            <td>${user.created_by_id || 'System'} <br><small>${new Date(user.created_at).toLocaleString()}</small></td>
            <td>
                <span class="badge badge-${getRoleBadgeClass(user.role)}">
                    ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </span>
            </td>
            <td>${formatCurrency(user.wallet_balance)}</td>
            <td>
                <span class="badge badge-${user.status === 'active' ? 'success' : 'danger'}">
                    ${user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewUser('${user._id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-warning" onclick="editUser('${user._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Get badge class based on user role
function getRoleBadgeClass(role) {
    switch (role) {
        case 'admin': return 'danger';
        case 'supermaster': return 'warning';
        case 'master': return 'info';
        case 'user': return 'success';
        default: return 'secondary';
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

// View user details
function viewUser(userId) {
    // Get auth token from local storage
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showNotification('error', 'Authentication error. Please log in again.');
        return;
    }
    
    // Fetch user details from API with auth token
    fetch(`/api/user_management/users/${userId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('User data received:', data);
            if (data.success) {
                const user = data.user;
                console.log('User details:', user);
                
                try {
                    // Populate user details in the modal using standardized fields
                    document.getElementById('view-username').textContent = user.username || '-';
                    document.getElementById('view-full-name').textContent = user.full_name || '-';
                    document.getElementById('view-created-by').textContent = user.parent_id || 'System';
                    document.getElementById('view-created-at').textContent = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
                    document.getElementById('view-role').textContent = user.role || '-';
                    document.getElementById('view-balance').textContent = user.wallet_balance !== undefined ? `$${parseFloat(user.wallet_balance).toFixed(2)}` : '$0.00';
                    document.getElementById('view-status').textContent = user.status || 'active';
                    document.getElementById('view-contact').textContent = user.phone || '-';
                    document.getElementById('view-reference').textContent = user.reference || '-';
                    document.getElementById('view-created').textContent = user.created_at ? new Date(user.created_at).toLocaleString() : '-';
                    document.getElementById('view-last-login').textContent = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
                } catch (err) {
                    console.error('Error populating user details:', err);
                    showNotification('error', 'Error displaying user details');
                }
                
                // Store user ID for edit button
                document.getElementById('edit-user-from-view').setAttribute('data-user-id', userId);
                
                // Show the modal
                const modal = document.getElementById('view-user-modal');
                modal.style.display = 'block';
                
                // Setup close button
                const closeBtn = modal.querySelector('.close');
                closeBtn.onclick = function() {
                    modal.style.display = 'none';
                };
                
                // Setup close button
                document.getElementById('close-view-user').onclick = function() {
                    modal.style.display = 'none';
                };
                
                // Setup edit button
                document.getElementById('edit-user-from-view').onclick = function() {
                    modal.style.display = 'none';
                    editUser(userId);
                };
            } else {
                showNotification('error', data.message || 'Failed to load user details');
            }
        })
        .catch(error => {
            console.error('Error fetching user details:', error);
            showNotification('error', 'An error occurred while loading user details');
        });
}

// Edit user
function editUser(userId) {
    // Get auth token from local storage
    const token = localStorage.getItem('auth_token');
    if (!token) {
        showNotification('error', 'Authentication error. Please log in again.');
        return;
    }
    
    // Fetch user details from API with auth token
    fetch(`/api/user_management/users/${userId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Edit user data received:', data);
            if (data.success) {
                const user = data.user;
                console.log('Edit user details:', user);
                
                try {
                    // Populate form fields with standardized data
                    document.getElementById('edit-user-id').value = userId;
                    document.getElementById('edit-username').value = user.username || '';
                    document.getElementById('edit-full-name').value = user.full_name || '';
                    document.getElementById('edit-email').value = user.email || '';
                    document.getElementById('edit-password').value = ''; // Clear password field for security
                    document.getElementById('edit-role').value = user.role || 'user';
                    document.getElementById('edit-wallet-balance').value = parseFloat(user.wallet_balance || 0);
                    document.getElementById('edit-contact').value = user.phone || '';
                    document.getElementById('edit-reference').value = user.reference || '';
                    document.getElementById('edit-status').value = user.status || 'active';
                } catch (err) {
                    console.error('Error populating edit form:', err);
                    showNotification('error', 'Error loading user data for editing');
                    return;
                }
                
                // Show the modal
                const modal = document.getElementById('edit-user-modal');
                modal.style.display = 'block';
                
                // Setup close button
                const closeBtn = modal.querySelector('.close');
                closeBtn.onclick = function() {
                    modal.style.display = 'none';
                };
                
                // Setup cancel button
                document.getElementById('cancel-edit-user').onclick = function() {
                    modal.style.display = 'none';
                };
                
                // Setup form submission
                const form = document.getElementById('edit-user-form');
                form.onsubmit = function(e) {
                    e.preventDefault();
                    
                    // Get form data
                    const formData = {
                        username: document.getElementById('edit-username').value,
                        full_name: document.getElementById('edit-full-name').value,
                        email: document.getElementById('edit-email').value,
                        role: document.getElementById('edit-role').value,
                        wallet_balance: parseFloat(document.getElementById('edit-wallet-balance').value) || 0,
                        phone: document.getElementById('edit-contact').value, // Using standardized 'phone' field name instead of 'contact'
                        reference: document.getElementById('edit-reference').value,
                        status: document.getElementById('edit-status').value
                    };
                    
                    // Add password only if it's not empty
                    const password = document.getElementById('edit-password').value;
                    if (password) {
                        formData.password = password;
                    }
                    
                    // Get auth token from local storage
                    const token = localStorage.getItem('auth_token');
                    if (!token) {
                        showNotification('error', 'Authentication error. Please log in again.');
                        return;
                    }
                    
                    // Send update request with auth token
                    console.log('Sending update for user:', userId, 'with data:', formData);
                    fetch(`/api/user_management/users/${userId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(formData)
                    })
                    .then(response => {
                        console.log('Update response status:', response.status);
                        return response.json().then(data => {
                            console.log('Update response data:', data);
                            return { status: response.status, data };
                        });
                    })
                    .then(({ status, data }) => {
                        if (data.success) {
                            console.log('Update successful');
                            showNotification('success', 'User updated successfully');
                            modal.style.display = 'none';
                            // Refresh user list
                            fetchUsers(document.getElementById('role-filter').value);
                        } else {
                            console.error('Update failed:', data.message);
                            showNotification('error', data.message || 'Failed to update user');
                        }
                    })
                    .catch(error => {
                        console.error('Error updating user:', error);
                        showNotification('error', 'An error occurred while updating user');
                    });
                };
            } else {
                showNotification('error', data.message || 'Failed to load user details');
            }
        })
        .catch(error => {
            console.error('Error fetching user details:', error);
            showNotification('error', 'An error occurred while loading user details');
        });
}

// Delete user
function deleteUser(userId) {
    if (confirm(`Are you sure you want to delete this user? This action cannot be undone.`)) {
        // Get auth token from local storage
        const token = localStorage.getItem('auth_token');
        if (!token) {
            showNotification('error', 'Authentication error. Please log in again.');
            return;
        }
        
        // Send delete request with auth token
        fetch(`/api/user_management/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showNotification('success', 'User deleted successfully');
                // Refresh user list
                fetchUsers(document.getElementById('role-filter').value);
            } else {
                showNotification('error', data.message || 'Failed to delete user');
            }
        })
        .catch(error => {
            console.error('Error deleting user:', error);
            showNotification('error', 'An error occurred while deleting user');
        });
    }
}

// Set up create admin modal
function setupCreateAdminModal() {
    const modal = document.getElementById('create-admin-modal');
    const btn = document.getElementById('create-admin-btn');
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = document.getElementById('cancel-create-admin');
    const form = document.getElementById('create-admin-form');
    
    // Open modal when button is clicked
    btn.addEventListener('click', function() {
        modal.style.display = 'block';
    });
    
    // Close modal when X is clicked
    closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Close modal when Cancel button is clicked
    cancelBtn.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking outside the modal content
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Handle form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const username = document.getElementById('username').value;
        const fullName = document.getElementById('full-name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const role = document.getElementById('role').value;
        const initialBalance = parseFloat(document.getElementById('initial-balance').value) || 0;
        const contact = document.getElementById('contact').value;
        const reference = document.getElementById('reference').value;
        
        // Validate passwords match
        if (password !== confirmPassword) {
            alert('Passwords do not match!');
            return;
        }
        
        // Create form data object
        const formData = {
            username: username,
            full_name: fullName || username, // Use username as fallback if full name is empty
            email: email || `${username}@example.com`, // Generate email if not provided
            password: password,
            role: role,
            initial_balance: initialBalance,
            phone: contact, // Using standardized 'phone' field name instead of 'contact'
            reference: reference
        };
        
        // Submit form data to API
        // Get auth token from local storage
        const token = localStorage.getItem('auth_token');
        if (!token) {
            alert('Authentication error. Please log in again.');
            return;
        }
        
        fetch('/api/user_management/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                alert('User created successfully!');
                modal.style.display = 'none';
                form.reset();
                
                // Refresh user list if on users page
                if (document.getElementById('users-page').classList.contains('active')) {
                    fetchUsers(document.getElementById('role-filter').value);
                }
                
                // Refresh dashboard stats
                refreshDashboard();
            } else {
                alert(`Error: ${data.message || 'Failed to create user'}`);                
            }
        })
        .catch(error => {
            console.error('Error creating user:', error);
            alert('An error occurred while creating the user. Please try again.');
        });
    });
}
