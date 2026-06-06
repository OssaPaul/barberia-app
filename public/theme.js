document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DEL DOM ---
    const initialSetupContainer = document.getElementById('initial-setup-container');
    const mainContent = document.getElementById('main-content');
    
    // Elementos del selector de barbería
    const barberiaSelect = document.getElementById('barberia-select');
    
    // Elementos del selector de tema
    const themeSelectionArea = document.getElementById('theme-selection-area');
    const btnLightMode = document.getElementById('select-light-mode');
    const btnDarkMode = document.getElementById('select-dark-mode');
    const colorOptionsContainer = document.getElementById('color-options-container');
    const colorButtonsContainer = document.querySelector('.theme-color-buttons');

    // Definición de temas y paletas
    const themes = {
        light: [
            { name: 'Clásico', class: 'light-classic', color: '#8a6d3b' },
            { name: 'Azul', class: 'light-blue', color: '#0d6efd' },
            { name: 'Verde', class: 'light-green', color: '#198754' }
        ],
        dark: [
            { name: 'Clásico', class: 'dark-classic', color: '#b08f57' },
            { name: 'Púrpura', class: 'dark-purple', color: '#9d50bb' },
            { name: 'Cian', class: 'dark-cyan', color: '#17a2b8' }
        ]
    };

    // --- FUNCIÓN PARA CARGAR Y CONFIGURAR EL SELECTOR DE BARBERÍAS ---
    const loadAndSetupBarberiaSelector = async () => {
        try {
            // NOTA: Asegúrate de que este endpoint '/api/barberias' exista en tu backend
            // y que sea público (no requiera token de autenticación).
            const response = await fetch(`${API_BASE_URL}/api/barberias`);
            if (!response.ok) throw new Error('No se pudo obtener la lista de barberías.');
            
            const barberias = await response.json();

            if (barberiaSelect) {
                barberiaSelect.innerHTML = '<option value="" disabled selected>-- Elige una opción --</option>'; // Opción por defecto
                if (barberias.length > 0) {
                    barberias.forEach(barberia => {
                        const option = document.createElement('option');
                        option.value = barberia.barberia_id;
                        option.textContent = barberia.nombre;
                        option.dataset.logo = barberia.logoUrl || '/images/barberflow+.png';
                        option.dataset.nombre = barberia.nombre;
                        barberiaSelect.appendChild(option);
                    });
                } else {
                    barberiaSelect.innerHTML = '<option value="">No hay barberías disponibles</option>';
                    barberiaSelect.disabled = true;
                }
            }
        } catch (error) {
            console.error('Error al cargar barberías:', error);
            if (barberiaSelect) {
                barberiaSelect.innerHTML = '<option value="">Error al cargar</option>';
                barberiaSelect.disabled = true;
            }
        }
    };

    // --- FUNCIÓN PARA PREPARAR EL FORMULARIO DE LOGIN ---
    const setupLoginForm = () => {
        const logoUrl = localStorage.getItem('barberia_logo');
        const nombre = localStorage.getItem('barberia_nombre');
        
        const loginLogo = document.getElementById('login-logo');
        const loginTitle = document.getElementById('login-title');

        if (logoUrl && nombre && loginLogo && loginTitle) {
            loginLogo.src = logoUrl;
            loginTitle.textContent = `Acceso a ${nombre}`;
        }
    };

    // --- LÓGICA DEL SELECTOR DE TEMAS ---
    const showColorOptions = (mode) => {
        colorButtonsContainer.innerHTML = '';
        themes[mode].forEach(palette => {
            const button = document.createElement('button');
            button.textContent = palette.name;
            button.style.backgroundColor = palette.color;
            button.dataset.themeClass = palette.class;
            colorButtonsContainer.appendChild(button);
        });
        colorOptionsContainer.style.display = 'block';
    };
    
    const applyThemeAndShowApp = (themeClass) => {
        document.documentElement.className = themeClass;
        localStorage.setItem('theme', themeClass);

        setupLoginForm(); // Prepara el login con el logo/título correctos

        if (mainContent) mainContent.style.display = 'block';
        if (initialSetupContainer) {
            initialSetupContainer.style.opacity = '0';
            setTimeout(() => {
                initialSetupContainer.style.display = 'none';
            }, 500);
        }
    };

    // --- FUNCIÓN PRINCIPAL DE INICIO ---
    const handleInitialLoad = () => {
        const savedBarberiaId = localStorage.getItem('barberia_id');
        const savedTheme = localStorage.getItem('theme');

        if (savedBarberiaId && savedTheme) {
            // Si ya se ha configurado todo, vamos directo al login
            if (initialSetupContainer) initialSetupContainer.style.display = 'none';
            setupLoginForm();
            if (mainContent) mainContent.style.display = 'block';
        } else {
            // Si falta algo, mostramos el configurador inicial
            if (initialSetupContainer) initialSetupContainer.style.display = 'flex';
            loadAndSetupBarberiaSelector();
        }
    };

    // --- EVENT LISTENERS ---

    // 1. Cuando se selecciona una barbería del dropdown
    if (barberiaSelect) {
        barberiaSelect.addEventListener('change', (event) => {
            const selectedOption = event.target.options[event.target.selectedIndex];
            if (!selectedOption || !selectedOption.value) return;

            const barberiaId = selectedOption.value;
            const logoUrl = selectedOption.dataset.logo;
            const nombre = selectedOption.dataset.nombre;

            // Guardamos los datos de la barbería
            localStorage.setItem('barberia_id', barberiaId);
            localStorage.setItem('barberia_logo', logoUrl);
            localStorage.setItem('barberia_nombre', nombre);
            
            // Mostramos la siguiente sección (selección de tema)
            if (themeSelectionArea) {
                themeSelectionArea.style.display = 'block';
            }
        });
    }

    // 2. Clic en los botones de modo (Claro/Oscuro)
    if (btnLightMode) btnLightMode.addEventListener('click', () => showColorOptions('light'));
    if (btnDarkMode) btnDarkMode.addEventListener('click', () => showColorOptions('dark'));

    // 3. Clic en los botones de paletas de color
    if (colorButtonsContainer) {
        colorButtonsContainer.addEventListener('click', (event) => {
            if (event.target.tagName === 'BUTTON') {
                const themeClass = event.target.dataset.themeClass;
                if (themeClass) {
                    applyThemeAndShowApp(themeClass);
                }
            }
        });
    }
    
    // --- INICIO DE LA APLICACIÓN ---
    handleInitialLoad();
});

