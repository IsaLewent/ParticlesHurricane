varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
    vec2 uv = gl_PointCoord.xy;
    float dist = length(uv - vec2(0.5));
    if (dist > 0.5) discard;

    // Yumuşak çekirdekli parçacık dokusu
    float alpha = smoothstep(0.5, 0.18, dist) * vAlpha;

    gl_FragColor = vec4(vColor, alpha);
}
