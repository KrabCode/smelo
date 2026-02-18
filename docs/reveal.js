(function () {
    var style = document.createElement('style');
    style.textContent =
        '.reveal{opacity:0;transform:translateY(20px);transition:opacity 0.5s ease,transform 0.5s ease}' +
        '.reveal.visible{opacity:1;transform:translateY(0)}';
    document.head.appendChild(style);

    function init() {
        var targets = document.querySelectorAll(
            '.container > h2, .container > p, .container > .formula, .container > .example,' +
            '.container > .calc, .container > .tip, .container > .qa,' +
            '.card-list > .card,' +
            '.smelkarta'
        );

        for (var i = 0; i < targets.length; i++) {
            targets[i].classList.add('reveal');
        }

        if (!('IntersectionObserver' in window)) {
            for (var j = 0; j < targets.length; j++) {
                targets[j].classList.add('visible');
            }
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        for (var k = 0; k < targets.length; k++) {
            observer.observe(targets[k]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
