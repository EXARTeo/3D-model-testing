/**
 * Thalassa Stone Rooms - Main JavaScript
 * Handles navigation, form interactions, and UI enhancements
 */

(function() {
    'use strict';

    // ============================================
    // DOM Elements
    // ============================================
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const tourOverlay = document.getElementById('tourOverlay');
    const tourFrame = document.getElementById('tourFrame');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const contactForm = document.getElementById('contactForm');

    // ============================================
    // Navigation
    // ============================================

    // Scroll handler for navbar styling
    function handleScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    // Mobile menu toggle
    function toggleMobileMenu() {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    }

    // Close mobile menu when clicking a link
    function closeMobileMenu() {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Smooth scroll for anchor links
    function handleAnchorClick(e) {
        const href = e.currentTarget.getAttribute('href');
        if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navHeight = navbar.offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                closeMobileMenu();
            }
        }
    }

    // ============================================
    // 3D Tour Section
    // ============================================

    // Remove overlay when clicked to activate tour
    function activateTour() {
        tourOverlay.classList.add('hidden');
        // Optionally reload iframe to reset the tour
        // tourFrame.src = tourFrame.src;
    }

    // Open tour in fullscreen
    function openFullscreenTour() {
        const tourContainer = document.querySelector('.tour-frame-container');

        if (tourContainer.requestFullscreen) {
            tourContainer.requestFullscreen();
        } else if (tourContainer.webkitRequestFullscreen) {
            tourContainer.webkitRequestFullscreen();
        } else if (tourContainer.msRequestFullscreen) {
            tourContainer.msRequestFullscreen();
        } else {
            // Fallback: open tour page in new tab
            window.open('tour/index.html', '_blank');
        }

        // Also activate the tour
        activateTour();
    }

    // ============================================
    // Contact Form (UI Demo)
    // ============================================

    function handleFormSubmit(e) {
        e.preventDefault();

        // Gather form data
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        // Create success message
        const successMessage = document.createElement('div');
        successMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 2rem 3rem;
            border-radius: 8px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            z-index: 9999;
            text-align: center;
            max-width: 400px;
        `;
        successMessage.innerHTML = `
            <h3 style="color: #1a3a4a; margin-bottom: 0.5rem; font-family: 'Cormorant Garamond', serif; font-size: 1.5rem;">Thank You!</h3>
            <p style="color: #5a6c7d; margin-bottom: 1rem;">Your inquiry has been received. We'll respond within 24 hours.</p>
            <p style="color: #8b9cad; font-size: 0.85rem;">(This is a demo - no data was sent)</p>
            <button onclick="this.parentElement.remove()" style="
                margin-top: 1rem;
                padding: 0.75rem 1.5rem;
                background: #1a3a4a;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
            ">Close</button>
        `;

        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9998;
        `;
        backdrop.onclick = () => {
            backdrop.remove();
            successMessage.remove();
        };

        document.body.appendChild(backdrop);
        document.body.appendChild(successMessage);

        // Reset form
        contactForm.reset();
    }

    // ============================================
    // Date Input Enhancement
    // ============================================

    function setupDateInputs() {
        const checkinInput = document.getElementById('checkin');
        const checkoutInput = document.getElementById('checkout');

        if (checkinInput && checkoutInput) {
            // Set minimum date to today
            const today = new Date().toISOString().split('T')[0];
            checkinInput.min = today;
            checkoutInput.min = today;

            // Update checkout minimum when checkin changes
            checkinInput.addEventListener('change', () => {
                const checkinDate = new Date(checkinInput.value);
                checkinDate.setDate(checkinDate.getDate() + 1);
                checkoutInput.min = checkinDate.toISOString().split('T')[0];

                // Clear checkout if it's before new minimum
                if (new Date(checkoutInput.value) <= new Date(checkinInput.value)) {
                    checkoutInput.value = '';
                }
            });
        }
    }

    // ============================================
    // Intersection Observer for Animations
    // ============================================

    function setupScrollAnimations() {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Observe section elements
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(20px)';
            section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(section);
        });
    }

    // ============================================
    // Initialize
    // ============================================

    function init() {
        // Scroll events
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // Check initial state

        // Mobile navigation
        if (navToggle) {
            navToggle.addEventListener('click', toggleMobileMenu);
        }

        // Anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', handleAnchorClick);
        });

        // Tour section
        if (tourOverlay) {
            tourOverlay.addEventListener('click', activateTour);
        }

        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', openFullscreenTour);
        }

        // Contact form
        if (contactForm) {
            contactForm.addEventListener('submit', handleFormSubmit);
        }

        // Date inputs
        setupDateInputs();

        // Scroll animations
        setupScrollAnimations();

        // Close mobile menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobileMenu();
            }
        });

    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
