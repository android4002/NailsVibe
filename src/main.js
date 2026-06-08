document.addEventListener('alpine:init', () => {
    Alpine.data('nailsApp', () => ({
        // Данные сайта
        salonName: 'NailsVibe',
        masterName: 'Марина',
        tagline: '',
        bio: '',
        bookingUrl: '',
        bookingUrlApp: '',
        dikidiId: '',
        yandexMetrikaId: '',
        yandexMapsIframe: '',
        contacts: {},
        blocksVisibility: {
            hero: true,
            about: true,
            benefits: true,
            beforeAfter: true,
            portfolio: true,
            price: true,
            cozyCabinet: true,
            reviews: true,
            contacts: true
        },
        blocksOrder: ['hero', 'about', 'benefits', 'beforeAfter', 'portfolio', 'price', 'cozyCabinet', 'reviews', 'contacts'],
        hiddenElements: {},
        heroBlock: {},
        aboutBlock: {},
        benefitsBlock: {},
        beforeAfterBlock: {},
        portfolioBlock: {},
        priceBlock: {},
        priceHelper: {},
        contactsBlock: {},
        footerBlock: {},
        cozyCabinet: {},
        reviewsBlock: {},
        cabinetVideosBlock: {},
        cabinetVideos: [],
        activeCabinetVideo: null,
        yandexWidgetId: '',
        reviews: [],
        benefits: [],
        categories: [],
        services: [],
        beforeAfter: [],
        socials: [],
        portfolio: [],

        // Интерактивное состояние
        selectedCategory: 'all',
        selectedGalleryCategory: 'all',
        sliderPosition: 50,
        isDraggingSlider: false,
        isStickyCtaVisible: false,
        isLoading: true,
        scrollYOffset: 0,
        selectedServiceDetail: null,
        visibleReviewsLimit: 3,
        isDark: false,
        selectedServicesForCalc: [],
        isCalcDrawerOpen: false,
        toast: { visible: false, message: '', type: 'success' },
        bookingModal: { open: false, servicesText: '' },
        serverError: false,

        // Инициализация данных
        async init() {
            window.triggerHaptic = (intensity) => this.triggerHaptic(intensity);
            
            // Восстановление выбранных услуг из localStorage
            try {
                const savedServices = localStorage.getItem('selectedServicesForCalc');
                if (savedServices) {
                    this.selectedServicesForCalc = JSON.parse(savedServices);
                }
            } catch (e) {
                console.error('Failed to load selected services from localStorage', e);
            }

            try {
                // Инициализация темы
                const savedTheme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                    this.isDark = true;
                    document.documentElement.classList.add('dark');
                } else {
                    this.isDark = false;
                    document.documentElement.classList.remove('dark');
                }

                const response = await fetch('data/site_data.json?v=' + new Date().getTime());
                const data = await response.json();
                
                // Присваиваем данные из JSON
                this.yandexMetrikaId = data.yandexMetrikaId || '';
                if (this.yandexMetrikaId) {
                    this.initYandexMetrika(this.yandexMetrikaId);
                }
                this.salonName = data.salonName;
                this.masterName = data.masterName;
                this.tagline = data.tagline;
                this.bio = data.bio;
                this.bookingUrl = data.bookingUrl;
                this.bookingUrlApp = data.bookingUrlApp;
                this.dikidiId = data.dikidiId;
                this.yandexMapsIframe = data.yandexMapsIframe;
                this.contacts = data.contacts;
                this.blocksVisibility = data.blocksVisibility || {};
                if (this.blocksVisibility.stories !== undefined) {
                    delete this.blocksVisibility.stories;
                }
                const defaultBlocks = ['hero', 'about', 'benefits', 'portfolio', 'price', 'cozyCabinet', 'reviews', 'contacts'];
                this.blocksOrder = (data.blocksOrder || defaultBlocks).filter(b => b !== 'stories' && b !== 'beforeAfter');
                this.hiddenElements = data.hiddenElements || {};
                this.heroBlock = data.heroBlock || {};
                this.aboutBlock = data.aboutBlock || {};
                this.benefitsBlock = data.benefitsBlock || {};
                this.beforeAfterBlock = data.beforeAfterBlock || {};
                this.portfolioBlock = data.portfolioBlock || {};
                this.priceBlock = data.priceBlock || {};
                this.priceHelper = data.priceHelper || {
                    bookingUrl: '',
                    modalTitle: 'Услуги скопированы',
                    modalDescription: 'Список выбранных процедур успешно скопирован в буфер обмена:',
                    modalHelpText: 'В открывшемся виджете DIKIDI выберите эти услуги вручную для подтверждения времени и деталей процедуры.',
                    modalButtonText: 'Перейти к онлайн-записи'
                };
                this.contactsBlock = data.contactsBlock || {};
                this.footerBlock = data.footerBlock || {};
                this.cozyCabinet = data.cozyCabinet || {};
                this.cabinetVideosBlock = data.cabinetVideosBlock || {
                    badge: 'Эфир из кабинета',
                    heading: 'Атмосфера лофт-кабинета',
                    description: 'Погрузитесь в эстетику нашего пространства через короткие видео: процесс создания безупречного покрытия, ароматный спешелти-кофе и детали интерьера.'
                };
                this.cabinetVideos = data.cabinetVideos || [];
                this.reviewsBlock = data.reviewsBlock || { badge: 'Отзывы гостей', heading: 'Ваши впечатления', description: 'Искренние отзывы гостей моего лофт-кабинета о качестве и атмосфере процедур.' };
                this.yandexWidgetId = data.yandexWidgetId || '';
                this.reviews = data.reviews || [];
                this.benefits = data.benefits;
                this.categories = data.categories;
                this.services = data.services;
                
                // Обратная совместимость для Before/After
                if (data.beforeAfter) {
                    if (Array.isArray(data.beforeAfter)) {
                        this.beforeAfter = data.beforeAfter;
                    } else if (typeof data.beforeAfter === 'object') {
                        this.beforeAfter = [
                            {
                                id: 'slider_default',
                                title: 'До и После',
                                before: data.beforeAfter.before || '',
                                after: data.beforeAfter.after || '',
                                beforeText: data.beforeAfterBlock?.beforeText || 'До',
                                afterText: data.beforeAfterBlock?.afterText || 'После',
                                hidden: false
                            }
                        ];
                    }
                } else {
                    this.beforeAfter = [];
                }
                
                this.socials = data.socials || [];
                this.portfolio = data.portfolio;
                
                this.isLoading = false;

                // Плавная прокрутка к сохраненной позиции после перезагрузки
                const savedScroll = sessionStorage.getItem('scrollPosition');
                if (savedScroll && !window.location.hash) {
                    Alpine.nextTick(() => {
                        setTimeout(() => {
                            window.scrollTo({
                                top: parseInt(savedScroll, 10),
                                behavior: 'smooth'
                            });
                            sessionStorage.removeItem('scrollPosition');
                            setTimeout(() => {
                                document.documentElement.classList.add('scroll-smooth');
                            }, 600); // даем время на плавную прокрутку
                        }, 150);
                    });
                } else if (!window.location.hash) {
                    Alpine.nextTick(() => {
                        window.scrollTo(0, 0);
                        setTimeout(() => {
                            document.documentElement.classList.add('scroll-smooth');
                        }, 100);
                    });
                } else {
                    document.documentElement.classList.add('scroll-smooth');
                }

                // Динамически загружаем виджет DIKIDI
                if (this.dikidiId) {
                    this.loadDikidiWidget(this.dikidiId);
                }

                // Инициализация нативной Яндекс.Карты, если библиотека загружена
                if (typeof ymaps !== 'undefined') {
                    ymaps.ready(() => this.initYandexMap());
                }

                // Открытие услуги из URL query параметра (например, при переходе из portfolio.html)
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const serviceParam = urlParams.get('service');
                    if (serviceParam) {
                        const matchedService = this.services.find(s => s.name === serviceParam);
                        if (matchedService) {
                            this.selectedServiceDetail = matchedService;
                            
                            // Очищаем URL от параметра, чтобы при ручном обновлении страницы карточка не открывалась заново
                            const newUrl = window.location.pathname + window.location.hash;
                            window.history.replaceState({}, document.title, newUrl);
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse URL query params', e);
                }
            } catch (error) {
                console.error('Ошибка загрузки данных site_data.json:', error);
                this.isLoading = false;
            }

            // Слушатель скролла для показа Sticky CTA и параллакса
            window.addEventListener('scroll', () => {
                const scrollY = window.scrollY;
                this.scrollYOffset = scrollY;
                const heroHeight = document.getElementById('hero')?.offsetHeight || 500;
                
                // Вычисляем расстояние до низа страницы
                const docHeight = Math.max(
                    document.body.scrollHeight, document.documentElement.scrollHeight,
                    document.body.offsetHeight, document.documentElement.offsetHeight,
                    document.body.clientHeight, document.documentElement.clientHeight
                );
                const distanceToBottom = docHeight - window.innerHeight - scrollY;
                
                // Кнопка видна, если прокрутили ниже первого экрана и не дошли до футера (отступ 350px)
                this.isStickyCtaVisible = (scrollY > heroHeight - 100) && (distanceToBottom > 350);
            });

            // Сохраняем положение скролла перед перезагрузкой
            window.addEventListener('beforeunload', () => {
                sessionStorage.setItem('scrollPosition', window.scrollY);
            });

            // Инициализация кастомного курсора и интерактивного фона
            this.initInteractiveExperience();
        },

        // Инициализация нативной Яндекс.Карты с автооткрытием точки и адреса
        initYandexMap() {
            const coords = this.contacts.mapCoordinates || [56.986511, 40.982095];
            const mapContainer = document.getElementById('yandex-map');
            if (!mapContainer) return;

            const map = new ymaps.Map("yandex-map", {
                center: coords,
                zoom: 16,
                controls: ['zoomControl']
            });

            const placemark = new ymaps.Placemark(coords, {
                balloonContentHeader: `<span style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; color: #1C1615; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">${this.salonName}</span>`,
                balloonContentBody: `<div style="font-family: 'Outfit', sans-serif; font-size: 11px; color: #1C1615; opacity: 0.8; line-height: 1.5; padding-top: 4px;">
                    <strong>Топ-мастер ${this.masterName}</strong><br>
                    ${this.contacts.address}<br>
                    <span style="color: #D59C8C; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; margin-top: 4px;">${this.contacts.workingHours}</span>
                </div>`,
                hintContent: this.salonName
            }, {
                preset: 'islands#pinkDotIcon'
            });

            map.geoObjects.add(placemark);
            
            // Отключаем зум скроллом мыши, чтобы не сбивать прокрутку страницы
            map.behaviors.disable('scrollZoom');
        },

        // Динамический расчет статуса работы мастера (Europe/Moscow)
        get workingStatus() {
            if (!this.contacts || !this.contacts.workingHoursStart || !this.contacts.workingHoursEnd) {
                return { isOpen: false, text: 'График не настроен' };
            }
            try {
                // Переводим текущее системное время в время по МСК (Europe/Moscow)
                const mskTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' });
                const mskTime = new Date(mskTimeStr);
                const hours = mskTime.getHours();
                const minutes = mskTime.getMinutes();
                const nowMinutes = hours * 60 + minutes;

                const [startH, startM] = this.contacts.workingHoursStart.split(':').map(Number);
                const [endH, endM] = this.contacts.workingHoursEnd.split(':').map(Number);
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                const isOpen = nowMinutes >= startMinutes && nowMinutes < endMinutes;
                
                if (isOpen) {
                    return {
                        isOpen: true,
                        text: `Открыто до ${this.contacts.workingHoursEnd}`
                    };
                } else {
                    return {
                        isOpen: false,
                        text: `Закрыто до ${this.contacts.workingHoursStart}`
                    };
                }
            } catch (e) {
                console.error('Ошибка расчета рабочих часов:', e);
                return { isOpen: false, text: 'Часы работы уточняйте' };
            }
        },

        // Динамическая загрузка скрипта виджета DIKIDI
        loadDikidiWidget(dikidiId) {
            if (!dikidiId) return;
            
            // Проверяем, загружен ли скрипт уже
            if (document.getElementById('dikidi-widget-init')) return;
            
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://widget.dikidi.ru/js/widget.js';
            script.id = 'dikidi-widget-init';
            script.setAttribute('data-id', dikidiId);
            script.setAttribute('data-title', 'Записаться онлайн');
            script.setAttribute('data-position', 'none'); // не показываем стандартную кнопку в углу, чтобы сохранить журнальный стиль
            script.setAttribute('data-button', 'false'); // отключаем дефолтную плавающей кнопку
            script.setAttribute('data-color', '#D59C8C');
            script.defer = true;
            
            document.body.appendChild(script);
        },

        toggleTheme() {
            this.isDark = !this.isDark;
            if (this.isDark) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
            this.triggerHaptic('medium');
        },

        triggerHaptic(intensity = 'light') {
            try {
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    if (intensity === 'light') {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                    } else if (intensity === 'medium') {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } else if (intensity === 'heavy') {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
                    }
                } else if (navigator.vibrate) {
                    if (intensity === 'light') {
                        navigator.vibrate(22);
                    } else if (intensity === 'medium') {
                        navigator.vibrate(40);
                    } else if (intensity === 'heavy') {
                        navigator.vibrate(70);
                    }
                }
            } catch (e) {
                console.warn('Haptic feedback error:', e);
            }
        },

        // Отфильтрованные услуги
        get filteredServices() {
            // Список ID активных категорий
            const activeCategoryIds = (this.categories || []).filter(c => !c.hidden).map(c => c.id);
            // Фильтруем услуги, оставляя только те, чья категория активна
            let list = (this.services || []).filter(s => activeCategoryIds.includes(s.category));
            
            if (this.selectedCategory !== 'all') {
                list = list.filter(s => s.category === this.selectedCategory);
            }
            // Сортировка: популярные услуги (popular === true) всегда идут выше
            return [...list].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
        },

        // Отфильтрованное портфолио
        get filteredPortfolio() {
            // Список ID активных категорий
            const activeCategoryIds = (this.categories || []).filter(c => !c.hidden).map(c => c.id);
            // Фильтруем портфолио, оставляя только те работы, чья категория активна
            let list = (this.portfolio || []).filter(item => activeCategoryIds.includes(item.category));
            
            if (this.selectedGalleryCategory === 'all') {
                return list;
            }
            return list.filter(item => item.category === this.selectedGalleryCategory);
        },

        openServiceFromPortfolio(item) {
            if (!item.service) return;
            const service = this.services.find(s => s.name === item.service);
            if (service) {
                this.selectedServiceDetail = service;
                this.triggerHaptic('medium');
            }
        },

        // Вспомогательный метод для динамической отрисовки премиум-иконок преимуществ
        getBenefitIconSvg(iconName) {
            const icons = {
                'sparkles': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21L8.188 15.904L3 15L8.188 14.096L9 9L9.813 14.096L15 15L9.813 15.904ZM19.071 4.929L18.5 8.5L17.929 4.929L14.5 4.358L17.929 3.787L18.5 0.216L19.071 3.787L22.5 4.358L19.071 4.929Z"/></svg>`,
                'heart': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>`,
                'shield-check': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.286z"/></svg>`,
                'badge-check': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"/></svg>`,
                'crown': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.487 13.587L17.75 3.75L12.5 7.5L7.25 3.75L9.513 13.587M3 16.25H21M6.25 16.25l1-2.75M16.75 16.25l-1-2.75"/></svg>`,
                'coffee': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75c0-1.242.504-2.368 1.32-3.181M14.25 9.75c0-1.242-.504-2.368-1.32-3.181m1.32 3.181a4.249 4.249 0 01-1.32 3.181m0 0a4.249 4.249 0 01-1.32-3.181M3.75 18h16.5M4.5 9h11.25M18 9h1.5a2.25 2.25 0 012.25 2.25v1.5A2.25 2.25 0 0119.5 15H18M4.5 9v6.75a2.25 2.25 0 002.25 2.25h6.75a2.25 2.25 0 002.25-2.25V9"/></svg>`,
                'star': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499c.172-.468.82-.468.992 0l1.83 4.969a1 1 0 00.95.69h5.162c.507 0 .717.65.312.981l-4.177 3.416a1 1 0 00-.34.1.98.98 0 00-.18.256l1.83 4.969c.173.468-.372.865-.78.581L12 18.75l-4.178 3.414c-.407.284-.951-.113-.78-.581l1.83-4.97a1 1 0 00-.18-.255 1 1 0 00-.34-.1l-4.177-3.416c-.405-.33-.195-.981.313-.981h5.162a1 1 0 00.95-.69l1.83-4.969z"/></svg>`,
                'award': `<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.875V10.5h.875c.621 0 1.125-.504 1.125-1.125V6a3 3 0 00-3-3h-7.5a3 3 0 00-3 3v3.375c0 .621.504 1.125 1.125 1.125h.875V14.25h-.875c-.621 0-1.125.504-1.125 1.125v3.375m9 0h-9"/></svg>`
            };
            return icons[iconName] || '';
        },

        showToast(message, type = 'success') {
            this.toast.message = message;
            this.toast.type = type;
            this.toast.visible = true;
            setTimeout(() => {
                this.toast.visible = false;
            }, 4000);
        },

        saveCalcToLocalStorage() {
            try {
                localStorage.setItem('selectedServicesForCalc', JSON.stringify(this.selectedServicesForCalc));
            } catch (e) {
                console.error('Failed to save selected services to localStorage', e);
            }
        },

        toggleServiceInCalc(service) {
            const index = this.selectedServicesForCalc.findIndex(s => s.name === service.name);
            if (index > -1) {
                this.selectedServicesForCalc.splice(index, 1);
            } else {
                this.selectedServicesForCalc.push(service);
            }
            if (this.selectedServicesForCalc.length === 0) {
                this.isCalcDrawerOpen = false;
            }
            this.triggerHaptic('light');
            this.saveCalcToLocalStorage();
        },
        
        isServiceSelectedForCalc(service) {
            if (!service) return false;
            return this.selectedServicesForCalc.some(s => s.name === service.name);
        },

        clearCalc() {
            this.selectedServicesForCalc = [];
            this.isCalcDrawerOpen = false;
            this.saveCalcToLocalStorage();
        },
        
        get calcTotal() {
            return this.selectedServicesForCalc.reduce((sum, s) => sum + Number(s.price || 0), 0);
        },
        
        get calcTotalDuration() {
            return this.selectedServicesForCalc.reduce((sum, s) => {
                let mins = 0;
                const durStr = String(s.duration || '').toLowerCase();
                
                // Парсим часы
                const hourMatch = durStr.match(/(\d+)\s*(ч|h)/);
                if (hourMatch) {
                    mins += parseInt(hourMatch[1]) * 60;
                }
                
                // Парсим минуты
                const minMatch = durStr.match(/(\d+)\s*(м|min|мин)/);
                if (minMatch) {
                    mins += parseInt(minMatch[1]);
                } else if (!hourMatch && durStr.match(/^\d+$/)) {
                    mins += parseInt(durStr);
                }
                return sum + mins;
            }, 0);
        },
        
        get calcTotalDurationFormatted() {
            const mins = this.calcTotalDuration;
            if (mins <= 0) return '0 мин';
            if (mins < 60) {
                return `${mins} мин`;
            }
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            if (remainingMins === 0) {
                return `${hours} ч`;
            }
            return `${hours} ч ${remainingMins} мин`;
        },
        
        bookSelectedServices() {
            if (this.selectedServicesForCalc.length === 0) return;
            this.reachMetrikaGoal('copy_services');
            
            const serviceNames = this.selectedServicesForCalc.map(s => s.name).join(', ');
            
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(serviceNames);
                } else {
                    const el = document.createElement('textarea');
                    el.value = serviceNames;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                }
                this.showToast('Услуги скопированы!');
            } catch (e) {
                console.error('Не удалось скопировать услуги:', e);
            }
            
            // Открываем красивую модалку на сайте
            this.bookingModal.servicesText = serviceNames;
            this.bookingModal.open = true;
        },

        playCabinetVideo(video) {
            this.activeCabinetVideo = video;
            this.$nextTick(() => {
                const videoEl = document.getElementById('cabinet-video-player');
                if (videoEl) {
                    videoEl.load();
                    videoEl.play().catch(err => {
                        console.warn('Автозапуск заблокирован браузером, требуется клик пользователя.', err);
                    });
                }
            });
        },
        closeCabinetVideo() {
            const videoEl = document.getElementById('cabinet-video-player');
            if (videoEl) {
                videoEl.pause();
            }
            this.activeCabinetVideo = null;
        },

        getSelectedServiceMedia() {
            if (!this.selectedServiceDetail) return '';
            const list = this.getSelectedServiceMediaList();
            return list[this.activeSvcIndex] || '';
        },
        getSelectedServiceMediaList() {
            if (!this.selectedServiceDetail) return [];
            const mediaList = [];
            if (this.selectedServiceDetail.videoUrl) {
                mediaList.push(this.selectedServiceDetail.videoUrl);
            }
            if (this.selectedServiceDetail.images && this.selectedServiceDetail.images.length > 0) {
                mediaList.push(...this.selectedServiceDetail.images);
            } else if (this.selectedServiceDetail.image) {
                mediaList.push(this.selectedServiceDetail.image);
            }
            
            // Если включена опция связывания с Портфолио
            if (this.selectedServiceDetail.pullPortfolioImages) {
                const portfolioMatches = (this.portfolio || []).filter(item => {
                    return item.service === this.selectedServiceDetail.name || 
                           (item.category === this.selectedServiceDetail.category && !item.service);
                });
                portfolioMatches.forEach(item => {
                    if (item.images && item.images.length > 0) {
                        mediaList.push(...item.images);
                    } else if (item.image) {
                        mediaList.push(item.image);
                    }
                });
            }
            return [...new Set(mediaList)];
        },
        isVideoFile(url) {
            if (!url) return false;
            const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
            return cleanUrl.endsWith('.mp4') || 
                   cleanUrl.endsWith('.mov') || 
                   cleanUrl.endsWith('.webm') || 
                   cleanUrl.endsWith('.avi') || 
                   url.includes('mixkit.co/videos');
        },

        initYandexMetrika(id) {
            if (!id || window.ym) return;
            
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < e.scripts.length; j++) {if (e.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

            ym(id, "init", {
                 clickmap:true,
                 trackLinks:true,
                 accurateTrackBounce:true,
                 webvisor:true
            });
            console.log('[Yandex.Metrika] Счетчик успешно инициализирован: ' + id);
        },

        reachMetrikaGoal(goalName) {
            if (this.yandexMetrikaId && window.ym) {
                window.ym(this.yandexMetrikaId, 'reachGoal', goalName);
                console.log('[Yandex.Metrika] Достигнута цель: ' + goalName);
            }
        },

        // Инициализация интерактивного фонда световых сфер
        initInteractiveExperience() {
            const sphere1 = document.getElementById('glow-sphere-1');
            const sphere2 = document.getElementById('glow-sphere-2');
            
            // Отслеживание мыши только для параллакса фоновых сфер
            window.addEventListener('mousemove', (e) => {
                if (sphere1 && sphere2) {
                    const moveX = (e.clientX - window.innerWidth / 2) * 0.03;
                    const moveY = (e.clientY - window.innerHeight / 2) * 0.03;
                    sphere1.style.transform = `translate(${moveX}px, ${moveY}px)`;
                    sphere2.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
                }
            });
        }
    }));
});
