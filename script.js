import { API_BASE_URL } from "./config.js";

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const logoImg = document.querySelector('.logo');
    const h2Title = document.querySelector('.login-container h2');
    const loginButton = document.getElementById('login-button');

    // 1. Cargar configuración de la barbería al iniciar la página
    try {
        const response = await fetch(`${API_BASE_URL}/api/configuracion`);
        if (!response.ok) {
            throw new Error('No se pudo cargar la configuración de la barbería.');
        }
        const config = await response.json();

        // Actualizar el logo y el título dinámicamente
        if (config.logoUrl) {
            logoImg.src = `${API_BASE_URL}${config.logoUrl}`;
        }
        if (config.nombre) {
            document.title = `${config.nombre} - Acceso`;
            h2Title.textContent = `Acceso a ${config.nombre}`;
        }
    } catch (error) {
        console.error('Error al cargar configuración:', error);
        logoImg.alt = 'Logo no disponible';
        h2Title.textContent = 'Error de Configuración';
        errorMessage.textContent = 'No se pudo conectar con el servidor para cargar la configuración.';
    }

    // 2. Manejar el envío del formulario de login
    if (!loginForm) return;
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        loginButton.textContent = 'Verificando...';
        loginButton.disabled = true;
        errorMessage.textContent = '';

        try {
            const loginResponse = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
            });

            const data = await loginResponse.json();

            if (loginResponse.ok) {
                localStorage.setItem('authToken', data.token);
                window.location.href = '/dashboard.html';
            } else {
                throw new Error(data.message || 'Error: Credenciales incorrectas.');
            }
        } catch (error) {
            errorMessage.textContent = error.message;
            loginButton.textContent = 'Ingresar';
            loginButton.disabled = false;
        }
    });
});