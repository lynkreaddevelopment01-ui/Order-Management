const axios = require('axios');

async function testLogin() {
    try {
        const res = await axios.post('http://localhost:3000/api/auth/login', {
            username: 'superadmin',
            password: 'admin123'
        });
        console.log('Login Success:', res.data.success);
        console.log('User Role:', res.data.user.role);

        const token = res.data.token;
        const meRes = await axios.get('http://localhost:3000/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Auth Me Success:', meRes.data.user.username);
    } catch (err) {
        console.error('Login Failed:', err.response ? err.response.data : err.message);
    }
}

testLogin();
