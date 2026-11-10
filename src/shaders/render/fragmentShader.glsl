varying vec2 vUv;
varying vec3 vColor;

void main() {
    vec2 uv = gl_PointCoord.xy;

    float dist = length(uv - vec2(0.5));
    float alpha = smoothstep(0.5, 0.45, dist);

    gl_FragColor = vec4(vColor, alpha);
    
}