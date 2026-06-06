document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const changeBarberiaLink = document.getElementById('change-barberia'); 

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');
    const registerErrorMessage = document.getElementById('register-error-message');

    // --- Lógica para alternar entre Login y Registro ---
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginContainer.style.display = 'none';
            registerContainer.style.display = 'block';
        });
    }

    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'block';
        });
    }
    
    // --- Lógica para el botón de cambiar barbería ---
    if (changeBarberiaLink) {
        changeBarberiaLink.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Limpiar toda la selección para forzar el reinicio del flujo
            localStorage.removeItem('barberia_id');
            localStorage.removeItem('barberia_nombre');
            localStorage.removeItem('barberia_logo');
            localStorage.removeItem('theme');
            
            // Recargar la página para volver al selector de barbería
            window.location.reload();
        });
    }

    // --- Manejo del Formulario de LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorMessage.textContent = '';
            const loginButton = document.getElementById('login-button');
            loginButton.disabled = true;
            loginButton.textContent = 'Ingresando...';

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const barberia_id = localStorage.getItem('barberia_id');

            if (!barberia_id) {
                errorMessage.textContent = 'Error: No se ha seleccionado una barbería. Por favor, recarga la página.';
                loginButton.disabled = false;
                loginButton.textContent = 'Ingresar';
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, barberia_id })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('authToken', data.token);
                    window.location.href = 'dashboard.html';
                } else {
                    errorMessage.textContent = data.message || 'Error al iniciar sesión.';
                }
            } catch (error) {
                console.error('Error en el fetch de login:', error);
                errorMessage.textContent = 'No se pudo conectar con el servidor.';
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = 'Ingresar';
            }
        });
    }

    // --- Manejo del Formulario de REGISTRO ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            registerErrorMessage.textContent = '';
            const registerButton = document.getElementById('register-button');
            registerButton.disabled = true;
            registerButton.textContent = 'Registrando...';

            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (password !== confirmPassword) {
                registerErrorMessage.textContent = 'Las contraseñas no coinciden.';
                registerButton.disabled = false;
                registerButton.textContent = 'Registrarme';
                return;
            }

            const barberia_id = localStorage.getItem('barberia_id');
            if (!barberia_id) {
                registerErrorMessage.textContent = 'Error: No se ha seleccionado una barbería. Por favor, recarga la página.';
                registerButton.disabled = false;
                registerButton.textContent = 'Registrarme';
                return;
            }

            const userData = {
                nombre: document.getElementById('register-nombre').value,
                apellido: document.getElementById('register-apellido').value,
                email: document.getElementById('register-email').value,
                password: password,
                telefono: document.getElementById('register-telefono').value,
                fecha_nacimiento: document.getElementById('register-fecha-nacimiento').value || null,
                barberia_id: barberia_id
            };

            try {
                const response = await fetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });

                const data = await response.json();

                if (response.ok) {
                    alert('¡Registro exitoso! Ahora puedes iniciar sesión.');
                    showLoginLink.click(); // Simula un clic para volver al login
                } else {
                    registerErrorMessage.textContent = data.message || 'Error en el registro.';
                }
            } catch (error) {
                console.error('Error en el fetch de registro:', error);
                registerErrorMessage.textContent = 'No se pudo conectar con el servidor.';
            } finally {
                registerButton.disabled = false;
                registerButton.textContent = 'Registrarme';
            }
        });
    }
});

