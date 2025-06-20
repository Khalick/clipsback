// API client for the Student Portal
const API = {
  baseUrl: '',  // Empty string means same origin

  // Helper method for making API requests
  async request(endpoint, options = {}) {
    try {
      const token = localStorage.getItem('adminToken');
      
      // Set up headers
      let headers = {
        'Accept': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      // Only add Content-Type for non-FormData requests
      if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...headers,
          ...options.headers
        },
        ...options
      });

      // Handle different response types
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json().catch(() => ({}));
      } else {
        data = { message: await response.text().catch(() => 'Operation completed') };
      }
      
      if (!response.ok) {
        const errorMsg = data.error || data.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return { success: true, data };
    } catch (error) {
      console.error('API Request failed:', error);
      
      // Handle specific error types
      if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
        return { success: false, error: 'Network error. Unable to connect to server.' };
      } else if (error.message.includes('JSON')) {
        return { success: false, error: 'Invalid response from server.' };
      } else {
        return { success: false, error: error.message };
      }
    }
  },

  // Authentication
  async login(username, password) {
    return this.request('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  // Students
  async getStudents() {
    return this.request('/students');
  },

  async getStudent(id) {
    return this.request(`/students/${id}`);
  },

  async createStudent(data) {
    return this.request('/students', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateStudent(id, data) {
    return this.request(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteStudent(id) {
    return this.request(`/students/${id}`, {
      method: 'DELETE'
    });
  },

  // Health check
  async checkHealth() {
    return this.request('/api/health');
  }
};

// Export the API client
window.API = API;