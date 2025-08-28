// main.js
(() => {
  const container = document.getElementById('renderer');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(5, 5, 6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // --- controls ---
  let isPointerDown = false;
  let lastX = 0,
    lastY = 0;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    isPointerDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("pointerup", () => (isPointerDown = false));
  window.addEventListener("pointermove", (e) => {
    if (!isPointerDown) return;
    const dx = (e.clientX - lastX) / 200;
    const dy = (e.clientY - lastY) / 200;
    cubeGroup.rotation.y += dx;
    cubeGroup.rotation.x += dy;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  // --- lights ---
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x666666));

  // --- cube params ---
  const size = 3;
  const spacing = 1.05;
  const cubelets = [];
  const cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  const colorMap = {
    U: 0xffffff,
    D: 0xffff00,
    L: 0xff8000,
    R: 0xff0000,
    F: 0x00ff00,
    B: 0x0000ff,
  };

  function faceMaterial(color) {
    return new THREE.MeshLambertMaterial({
      color,
    });
  }

  function makeMaterialsForCubelet(xi, yi, zi) {
    return [
      faceMaterial(xi === 2 ? colorMap.R : 0x222222), // +X
      faceMaterial(xi === 0 ? colorMap.L : 0x222222), // -X
      faceMaterial(yi === 2 ? colorMap.U : 0x222222), // +Y
      faceMaterial(yi === 0 ? colorMap.D : 0x222222), // -Y
      faceMaterial(zi === 2 ? colorMap.F : 0x222222), // +Z
      faceMaterial(zi === 0 ? colorMap.B : 0x222222), // -Z
    ];
  }

  function createCube() {
    for (let xi = 0; xi < size; xi++) {
      for (let yi = 0; yi < size; yi++) {
        for (let zi = 0; zi < size; zi++) {
          const geo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
          const mats = makeMaterialsForCubelet(xi, yi, zi);
          const mesh = new THREE.Mesh(geo, mats);

          const cx = (xi - 1) * spacing;
          const cy = (yi - 1) * spacing;
          const cz = (zi - 1) * spacing;

          mesh.position.set(cx, cy, cz);
          mesh.userData.index = { x: xi - 1, y: yi - 1, z: zi - 1 };
          cubelets.push(mesh);
          cubeGroup.add(mesh);
        }
      }
    }
  }

  createCube();
  cubeGroup.rotation.set(-0.3, -0.105, 0);

  // --- animation loop ---
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // --- rotation system ---
  let animating = false;
  const moveQueue = [];
  const moveHistory = [];

  function axisForFace(face) {
    switch (face) {
      case "U":
        return { axis: new THREE.Vector3(0, 1, 0), key: "y", coord: 1 };
      case "D":
        return { axis: new THREE.Vector3(0, 1, 0), key: "y", coord: -1 };
      case "L":
        return { axis: new THREE.Vector3(1, 0, 0), key: "x", coord: -1 };
      case "R":
        return { axis: new THREE.Vector3(1, 0, 0), key: "x", coord: 1 };
      case "F":
        return { axis: new THREE.Vector3(0, 0, 1), key: "z", coord: 1 };
      case "B":
        return { axis: new THREE.Vector3(0, 0, 1), key: "z", coord: -1 };
    }
  }

  function getLayerCubies(face) {
    const info = axisForFace(face);
    return cubelets.filter(
      (c) => Math.round(c.userData.index[info.key]) === info.coord
    );
  }

  function rotateFace(face, clockwise = true, record = true) {
    moveQueue.push({ face, clockwise, record });
    if (!animating) runNextMove();
  }

  function runNextMove() {
    if (moveQueue.length === 0) return;
    const move = moveQueue.shift();
    performMove(move.face, move.clockwise, move.record).then(() => {
      setTimeout(() => {
        if (moveQueue.length > 0) runNextMove();
      }, 80);
    });
  }

  function performMove(face, clockwise = true, record = true) {
    return new Promise((resolve) => {
      if (animating) return resolve();
      animating = true;

      const info = axisForFace(face);
      const layer = getLayerCubies(face);

      const pivot = new THREE.Group();
      cubeGroup.add(pivot);

      layer.forEach((c) => pivot.attach(c));

      const direction = clockwise ? -1 : 1;
      const angleGoal = (Math.PI / 2) * direction;
      const duration = 250;
      const start = performance.now();

      function tick(t) {
        const elapsed = t - start;
        const ratio = Math.min(1, elapsed / duration);
        const eased = easeInOutCubic(ratio);
        const currentAngle = angleGoal * eased;

        pivot.rotation.set(0, 0, 0);
        if (info.key === "x") pivot.rotateX(currentAngle);
        if (info.key === "y") pivot.rotateY(currentAngle);
        if (info.key === "z") pivot.rotateZ(currentAngle);

        if (ratio < 1) {
          requestAnimationFrame(tick);
        } else {
          // --- detach cleanly ---
          pivot.updateMatrixWorld(true);
          layer.forEach((c) => {
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            c.getWorldPosition(worldPos);
            c.getWorldQuaternion(worldQuat);

            cubeGroup.add(c); // back to cubeGroup
            c.position.copy(cubeGroup.worldToLocal(worldPos));
            c.quaternion.copy(worldQuat);

            snapCubeletToGrid(c);
            updateCubeletIndexFromPosition(c);
          });

          cubeGroup.remove(pivot);

          if (record) {
            moveHistory.push({ face, clockwise });
            if (moveHistory.length > 200) moveHistory.shift();
          }

          animating = false;
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function snapCubeletToGrid(c) {
    c.position.set(
      Math.round(c.position.x / spacing) * spacing,
      Math.round(c.position.y / spacing) * spacing,
      Math.round(c.position.z / spacing) * spacing
    );
    const e = new THREE.Euler().setFromQuaternion(c.quaternion);
    c.rotation.set(
      Math.round(e.x / (Math.PI / 2)) * (Math.PI / 2),
      Math.round(e.y / (Math.PI / 2)) * (Math.PI / 2),
      Math.round(e.z / (Math.PI / 2)) * (Math.PI / 2)
    );
  }

  function updateCubeletIndexFromPosition(c) {
    const xi = Math.round(c.position.x / spacing);
    const yi = Math.round(c.position.y / spacing);
    const zi = Math.round(c.position.z / spacing);
    c.userData.index = { x: xi, y: yi, z: zi };
  }

  // --- UI wiring ---
  document.querySelectorAll("button[data-move]").forEach((b) => {
    b.addEventListener("click", () => {
      const move = b.getAttribute("data-move");
      let face = move[0];  // first char (U/D/L/R/F/B)
      let type = move.slice(1);

      if (type === "") {
      rotateFace(face, true); // normal clockwise
    } else if (type === "'") {
      rotateFace(face, false); // counterclockwise
    } else if (type === "2") {
      // rotate twice = two clockwise turns
      rotateFace(face, true);
      rotateFace(face, true);
    }
    });
  });

  document.getElementById("shuffleBtn").addEventListener("click", () => {
    if (animating) return;

    const faces = ["U", "D", "L", "R", "F", "B"];
    const modifiers = ["", "'", "2"]; // normal, counterclockwise, double
    const seq = [];
    for (let i = 0; i < 20; i++) {
      const f = faces[Math.floor(Math.random() * faces.length)];
      const m = modifiers[Math.floor(Math.random() * modifiers.length)];
      seq.push(f + m);
    }
    seq.forEach(move => {
      let face = move[0];
      let type = move.slice(1);

      if (type === "") {
        moveQueue.push({ face, clockwise: true, record: false });
      } else if (type === "'") {
        moveQueue.push({ face, clockwise: false, record: false });
      } else if (type === "2") {
        moveQueue.push({ face, clockwise: true, record: false });
        moveQueue.push({ face, clockwise: true, record: false });
      }
    });

    if (!animating) runNextMove();
  });

  document.getElementById("undoBtn").addEventListener("click", () => {
    if (moveHistory.length === 0 || animating) return;
    const last = moveHistory.pop();
    rotateFace(last.face, !last.clockwise, false);
  });

// --- Keyboard Controls: Cube + Camera ---
let pendingModifier = null; // for ' and 2
let camTheta = Math.atan2(camera.position.z, camera.position.x);
let camPhi = Math.atan2(camera.position.y, Math.sqrt(camera.position.x**2 + camera.position.z**2));
let camRadius = camera.position.length();

function updateCamera() {
  camera.position.x = camRadius * Math.cos(camPhi) * Math.cos(camTheta);
  camera.position.z = camRadius * Math.cos(camPhi) * Math.sin(camTheta);
  camera.position.y = camRadius * Math.sin(camPhi);
  camera.lookAt(0, 0, 0);
}

window.addEventListener("keydown", (e) => {
  if (animating) return;

  const key = e.key.toUpperCase();
  const step = 0.15; // camera rotation step

  // --- Camera Orbit (Arrow Keys) ---
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      camTheta += step;
      updateCamera();
      return;
    case "ArrowRight":
      e.preventDefault();
      camTheta -= step;
      updateCamera();
      return;
    case "ArrowUp":
      e.preventDefault();
      camPhi += step;
      camPhi = Math.min(Math.PI / 2 - 0.1, camPhi);
      updateCamera();
      return;
    case "ArrowDown":
      e.preventDefault();
      camPhi -= step;
      camPhi = Math.max(-Math.PI / 2 + 0.1, camPhi);
      updateCamera();
      return;
  }

  // --- Cube Moves ---
  if (["U","D","L","R","F","B"].includes(key)) {
    if (pendingModifier === "'") {
      rotateFace(key, false);
    } else if (pendingModifier === "2") {
      rotateFace(key, true);
      rotateFace(key, true);
    } else {
      rotateFace(key, true);
    }
    pendingModifier = null;
  } else if (key === "'") {
    pendingModifier = "'";
  } else if (key === "2") {
    pendingModifier = "2";
  } else {
    pendingModifier = null;
  }
});


// optional: clear pendingKey if user clicks elsewhere
window.addEventListener('keyup', () => {
  pendingKey = null;
});

  window.addEventListener("resize", () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  });

  window.rotateFace = rotateFace;

  cubelets.forEach((c) => updateCubeletIndexFromPosition(c));
})();

