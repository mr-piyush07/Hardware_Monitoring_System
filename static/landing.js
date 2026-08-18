document.addEventListener('DOMContentLoaded', function () {
    initNavbarScroll();
    initAnimatedCounters();
    initTelemetryAnimations();
    initParallaxEffect();
});

function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function initAnimatedCounters() {
    const counters = document.querySelectorAll('.stat-value');
    const observerOptions = {
        threshold: 0.4
    };

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element) {
    const target = parseFloat(element.getAttribute('data-target'));
    const decimals = parseInt(element.getAttribute('data-decimals')) || 0;
    const duration = 2000;
    const startTime = performance.now();
    const startValue = 0;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = easeOutCubic(progress);
        const currentValue = startValue + (target - startValue) * easeProgress;

        if (decimals > 0) {
            element.textContent = currentValue.toFixed(decimals);
        } else {
            element.textContent = Math.floor(currentValue).toLocaleString();
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function initTelemetryAnimations() {
    const tempCells = document.querySelectorAll('.cell-temp, .cell-temp-warn');
    setInterval(() => {
        tempCells.forEach(cell => {
            if (cell.textContent === '--') return;
            const current = parseFloat(cell.textContent);
            const fluctuation = (Math.random() - 0.5) * 0.6;
            const newValue = Math.max(30, Math.min(60, current + fluctuation));
            cell.textContent = newValue.toFixed(1);
        });
    }, 2500);

    const signalCells = document.querySelectorAll('.table-row .table-cell.cell-mono:nth-child(5)');
    setInterval(() => {
        signalCells.forEach(cell => {
            if (cell.textContent === '--') return;
            const current = parseInt(cell.textContent);
            const fluctuation = Math.floor((Math.random() - 0.5) * 4);
            const newValue = Math.max(-85, Math.min(-50, current + fluctuation));
            cell.textContent = newValue.toString();
        });
    }, 3500);
}

function initParallaxEffect() {
    const heroSection = document.querySelector('.hero-section');
    if (!heroSection) return;

    window.addEventListener('scroll', function () {
        const scrollY = window.scrollY;
        const heroBg = heroSection.querySelector(':scope::before');
        if (scrollY < window.innerHeight) {
            heroSection.style.setProperty('--bg-parallax', `${scrollY * 0.3}px`);
        }
    });

    const style = document.createElement('style');
    style.textContent = `
        .hero-section::before {
            transform: translateY(var(--bg-parallax, 0px));
            transition: transform 0.1s linear;
        }
    `;
    document.head.appendChild(style);
}

function goToLogin() {
    const btn = event.currentTarget;
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btn.style.transform = '';
        window.location.href = '/dashboard/?auth=login';
    }, 150);
}

function goToSignUp() {
    const btn = event.currentTarget;
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btn.style.transform = '';
        window.location.href = '/dashboard/?auth=register';
    }, 150);
}

function scrollToStats() {
    const statsSection = document.getElementById('stats-section');
    if (statsSection) {
        smoothScrollTo(statsSection.offsetTop - 20);
    }
}

function scrollToFeatures() {
    const featuresSection = document.getElementById('features-section');
    if (featuresSection) {
        smoothScrollTo(featuresSection.offsetTop - 40);
    }
}

function smoothScrollTo(targetY) {
    const startY = window.scrollY;
    const difference = targetY - startY;
    const duration = 800;
    const startTime = performance.now();

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = easeInOutQuad(progress);
        window.scrollTo(0, startY + difference * easeProgress);

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function toggleFilter() {
    const btn = event.currentTarget;
    btn.style.transform = 'rotate(90deg)';
    setTimeout(() => {
        btn.style.transform = '';
    }, 300);
}

document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', function () {
        this.style.transform = 'translateY(-6px) scale(1.01)';
    });
    card.addEventListener('mouseleave', function () {
        this.style.transform = '';
    });
});

document.querySelectorAll('.nav-btn, .cta-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.25);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
            z-index: 10;
        `;

        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);

        setTimeout(() => ripple.remove(), 600);
    });
});

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);

const observerOptions2 = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
};

const fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions2);

document.querySelectorAll('.stat-card, .feature-card, .telemetry-container').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    fadeObserver.observe(el);
});
