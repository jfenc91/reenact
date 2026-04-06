// Copy install command on click
document.querySelector('.install-cmd')?.addEventListener('click', function () {
  const hint = this.querySelector('.copy-hint');
  if (hint) {
    hint.textContent = 'copied!';
    setTimeout(() => { hint.textContent = 'click to copy'; }, 1500);
  }
});

// Smooth reveal on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .step, .example, .ref-card').forEach(el => {
  el.classList.add('reveal');
  observer.observe(el);
});

// Add reveal animation styles
const style = document.createElement('style');
style.textContent = `
  .reveal {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
  .reveal.visible {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);
