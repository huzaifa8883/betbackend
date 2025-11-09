// User Management JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    checkAuth();
    
    // Initialize modal functionality
    initModal();
    
    // Initialize forms if they exist
    initForms();
});

// Authentication functions
function checkAuth() {
    const token = localStorage.getItem('auth_token');
    
    // If no token and not on login page, redirect to login
    if (!token && !window.location.pathname.includes('login')) {
        window.location.href = '/login';
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// Modal functions
function initModal() {
    const modal = document.getElementById('modal');
    const closeModal = document.querySelector('.close-modal');
    
    if (modal && closeModal) {
        closeModal.addEventListener('click', function() {
            modal.style.display = 'none';
        });
        
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    if (modal && modalTitle && modalBody) {
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modal.style.display = 'block';
    }
}

// Form initialization
function initForms() {
    // User creation form
    const createUserForm = document.getElementById('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(createUserForm);
            const userData = {};
            
            formData.forEach((value, key) => {
                userData[key] = value;
            });
            
            createUser(userData);
        });
    }
    
    // User edit form
    const editUserForm = document.getElementById('edit-user-form');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(editUserForm);
            const userData = {};
            const userId = editUserForm.dataset.userId;
            
            formData.forEach((value, key) => {
                userData[key] = value;
            });
            
            updateUser(userId, userData);
        });
    }
    
    // Wallet update form
    const walletUpdateForm = document.getElementById('wallet-update-form');
    if (walletUpdateForm) {
        walletUpdateForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(walletUpdateForm);
            const transactionData = {};
            const userId = walletUpdateForm.dataset.userId;
            
            formData.forEach((value, key) => {
                transactionData[key] = value;
            });
            
            updateWallet(userId, transactionData);
        });
    }
}

// API functions for user management
function fetchUsers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/users?${queryString}`;
    
    fetch(url, {
        method: 'GET',
        headers: getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        return response.json();
    })
    .then(data => {
        renderUserTable(data.users);
        updatePagination(data.count, params.skip, params.limit);
    })
    .catch(error => {
        showError('Error fetching users: ' + error.message);
    });
}

function createUser(userData) {
    fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message) });
        }
        return response.json();
    })
    .then(data => {
        showSuccess('User created successfully!');
        // Refresh user list or redirect
        window.location.reload();
    })
    .catch(error => {
        showError('Error creating user: ' + error.message);
    });
}

function updateUser(userId, userData) {
    fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message) });
        }
        return response.json();
    })
    .then(data => {
        showSuccess('User updated successfully!');
        // Refresh user data
        window.location.reload();
    })
    .catch(error => {
        showError('Error updating user: ' + error.message);
    });
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to deactivate this user?')) {
        fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.message) });
            }
            return response.json();
        })
        .then(data => {
            showSuccess('User deactivated successfully!');
            // Refresh user list
            window.location.reload();
        })
        .catch(error => {
            showError('Error deactivating user: ' + error.message);
        });
    }
}

function fetchUserDetails(userId) {
    fetch(`/api/users/${userId}`, {
        method: 'GET',
        headers: getAuthHeaders()
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch user details');
        }
        return response.json();
    })
    .then(data => {
        showUserDetails(data);
    })
    .catch(error => {
        showError('Error fetching user details: ' + error.message);
    });
}

function updateWallet(userId, transactionData) {
    fetch(`/api/user_management/wallet/${userId}/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(transactionData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message) });
        }
        return response.json();
    })
    .then(data => {
        showSuccess(`Wallet updated successfully! New balance: ${data.new_balance}`);
        // Refresh wallet data
        window.location.reload();
    })
    .catch(error => {
        showError('Error updating wallet: ' + error.message);
    });
}

// Helper functions
function showSuccess(message) {
    alert(message); // Replace with better notification system
}

function showError(message) {
    alert(message); // Replace with better notification system
}

// Render functions - these would be implemented based on your specific UI needs
function renderUserTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (users.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center">No users found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td><span class="status-badge ${user.status}">${user.status}</span></td>
            <td>${user.wallet_balance.toFixed(2)}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td class="actions">
                <span class="action-icon view" onclick="fetchUserDetails('${user._id}')">
                    <i class="fas fa-eye"></i>
                </span>
                <span class="action-icon edit" onclick="editUser('${user._id}')">
                    <i class="fas fa-edit"></i>
                </span>
                <span class="action-icon delete" onclick="deleteUser('${user._id}')">
                    <i class="fas fa-trash-alt"></i>
                </span>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function updatePagination(totalCount, currentSkip, limit) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    pagination.innerHTML = '';
    
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(currentSkip / limit) + 1;
    
    for (let i = 1; i <= totalPages; i++) {
        const pageItem = document.createElement('div');
        pageItem.className = `pagination-item ${i === currentPage ? 'active' : ''}`;
        pageItem.textContent = i;
        pageItem.addEventListener('click', () => {
            const newSkip = (i - 1) * limit;
            fetchUsers({ skip: newSkip, limit });
        });
        pagination.appendChild(pageItem);
    }
}

function showUserDetails(user) {
    const content = `
        <div class="user-details">
            <div class="detail-row">
                <div class="detail-label">Username:</div>
                <div class="detail-value">${user.username}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Email:</div>
                <div class="detail-value">${user.email}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Full Name:</div>
                <div class="detail-value">${user.full_name || 'N/A'}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Role:</div>
                <div class="detail-value">
                    <span class="role-badge ${user.role}">${user.role}</span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Status:</div>
                <div class="detail-value">
                    <span class="status-badge ${user.status}">${user.status}</span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Wallet Balance:</div>
                <div class="detail-value">${user.wallet_balance.toFixed(2)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Created:</div>
                <div class="detail-value">${new Date(user.created_at).toLocaleString()}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Last Login:</div>
                <div class="detail-value">${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</div>
            </div>
        </div>
        <div class="modal-actions">
            <button class="action-button" onclick="editUser('${user._id}')">Edit User</button>
            <button class="action-button" onclick="window.location.href='/user_management/wallet/${user._id}'">Manage Wallet</button>
        </div>
    `;
    
    showModal(`User Details: ${user.username}`, content);
}
