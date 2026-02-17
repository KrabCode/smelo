document.addEventListener('DOMContentLoaded', function() {
    const titles = document.querySelectorAll('.collapsible-title');
    titles.forEach(function(title) {
        const arrow = title.querySelector('.arrow');
        const section = title.nextElementSibling;
        title.setAttribute('aria-expanded', 'true');
        title.setAttribute('tabindex', '0');
        title.setAttribute('role', 'button');
        title.addEventListener('click', function() {
            const isCollapsed = section.classList.toggle('collapsed-section');
            title.setAttribute('aria-expanded', !isCollapsed);
            arrow.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        });
        title.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                title.click();
            }
        });
    });
});
