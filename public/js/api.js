// Configuration and API utilities
const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('token');
}

function getRole() {
    return localStorage.getItem('role');
}

function getUser() {
    return {
        name: localStorage.getItem('name'),
        id: localStorage.getItem('id'),
        role: localStorage.getItem('role')
    };
}

function logout() {
    localStorage.clear();
    window.location.href = '/login.html';
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            // Uncomment to force logout on invalid token
            // logout();
        }
        throw new Error(data.error || 'API Request failed');
    }
    return data;
}

function checkAuthAndRole(allowedRoles = []) {
    const role = getRole();
    if (!role) {
        window.location.href = '/login.html';
        return false;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        window.location.href = '/home.html';
        return false;
    }
    return true;
}

function updateNav() {
    const navRight = document.getElementById('nav-right');
    if (!navRight) return;
    
    const role = getRole();
    if (role) {
        let dashboardLink = '/dashboard.html';
        if (role === 'instructor') dashboardLink = '/instructor.html';
        if (role === 'admin') dashboardLink = '/admin.html';
        
        navRight.innerHTML = `
            <a href="${dashboardLink}" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Dashboard</a>
            <a href="/profile.html" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Profile</a>
            <button onclick="logout()" class="ml-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition">Logout</button>
        `;
    } else {
        navRight.innerHTML = `
            <a href="/login.html" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Login</a>
            <a href="/register.html" class="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition">Register</a>
        `;
    }
}

// Auto-run nav update if available
document.addEventListener('DOMContentLoaded', updateNav);
