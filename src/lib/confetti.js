/**
 * Lightweight Zero-Dependency Canvas Confetti Explosion
 * Used for Champion Coronation and Correct Answer celebrations.
 */

let activeCanvas = null;
let animationFrameId = null;

export function triggerConfetti({ durationMs = 4000, particleCount = 120 } = {}) {
  if (typeof window === 'undefined') return;

  // Cleanup any existing canvas
  stopConfetti();

  const canvas = document.createElement('canvas');
  canvas.id = 'learnup-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';

  document.body.appendChild(canvas);
  activeCanvas = canvas;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#583FA9', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#FBBF24', '#ECE8F9'];

  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 300,
      y: window.innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 1.2) * 16 - 3,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      opacity: 1,
      decay: Math.random() * 0.005 + 0.003
    });
  }

  const startTime = Date.now();

  function render() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let hasAlive = false;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // Gravity
      p.vx *= 0.98; // Air resistance
      p.rotation += p.rotationSpeed;
      p.opacity -= p.decay;

      if (p.opacity > 0 && p.y < window.innerHeight + 50) {
        hasAlive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    if (hasAlive && Date.now() - startTime < durationMs) {
      animationFrameId = requestAnimationFrame(render);
    } else {
      stopConfetti();
    }
  }

  animationFrameId = requestAnimationFrame(render);
}

export function stopConfetti() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (activeCanvas && activeCanvas.parentNode) {
    activeCanvas.parentNode.removeChild(activeCanvas);
    activeCanvas = null;
  }
}
