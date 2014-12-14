#ifdef VERT

uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

attribute vec3 position;
attribute vec2 texCoord;

uniform mat4 viewMatrix;

uniform vec3 lightPos;

varying vec3 ecLighPos;
varying vec2 vTexCoord;
uniform float near;

void main() {
  vec3 pos = position;
  vec4 ecPos = modelViewMatrix * vec4(pos, 1.0);
  ecPos.z = min(ecPos.z, -near - 0.0001);
  gl_Position = projectionMatrix * ecPos;
  vTexCoord = gl_Position.xy/gl_Position.w * 0.5 + 0.5;
  ecLighPos = (viewMatrix * vec4(lightPos, 1.0)).xyz;
}

#endif

#ifdef FRAG

uniform mat4 invViewMatrix;
uniform mat4 invProjectionMatrix;

varying vec3 ecLighPos;
varying vec2 vTexCoord;
uniform sampler2D albedoMap;
uniform sampler2D normalMap;
uniform sampler2D depthMap;
uniform float lightBrightness;
uniform float lightRadius;
uniform vec4 lightColor;

uniform float roughness;

uniform float fov;
uniform float near;
uniform float far;
uniform float aspectRatio;
uniform bool showInfluence;
uniform bool showFalloff;
uniform bool showLightOnly;

const float PI = 3.14159265358979323846;

//fron depth buf normalized z to linear (eye space) z
//http://stackoverflow.com/questions/6652253/getting-the-true-z-value-from-the-depth-buffer
float ndcDepthToEyeSpace(float ndcDepth) {
  return 2.0 * near * far / (far + near - ndcDepth * (far - near));
}

//fron depth buf normalized z to linear (eye space) z
//http://stackoverflow.com/questions/6652253/getting-the-true-z-value-from-the-depth-buffer
float readDepth(sampler2D depthMap, vec2 coord) {
  float z_b = texture2D(depthMap, coord).r;
  float z_n = 2.0 * z_b - 1.0;
  return ndcDepthToEyeSpace(z_n);
}

vec3 getFarViewDir(vec2 tc) {
  float hfar = 2.0 * tan(fov/2.0/180.0 * PI) * far;
  float wfar = hfar * aspectRatio;
  vec3 dir = (vec3(wfar * (tc.x - 0.5), hfar * (tc.y - 0.5), -far));
  return dir;
}

vec3 getViewRay(vec2 tc) {
  vec3 ray = normalize(getFarViewDir(tc));
  return ray;
}

//asumming z comes from depth buffer (ndc coords) and it's not a linear distance from the camera but
//perpendicular to the near/far clipping planes
//http://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/
//assumes z = eye space z
vec3 reconstructPositionFromDepth(vec2 texCoord, float z) {
  vec3 ray = getFarViewDir(texCoord);
  vec3 pos = ray;
  return pos * z / far;
}

float blinnPhong(vec3 L, vec3 E, vec3 N) {
  vec3 halfVec = normalize(L + E);
  return max(0.0, dot(halfVec, N));
}

void main() {
  vec3 normal = texture2D(normalMap, vTexCoord).rgb; //assumes rgb = ecNormal.xyz + 0.5
  vec4 albedoValue = texture2D(albedoMap, vTexCoord);
  vec3 albedoColor = albedoValue.rgb;
  vec3 specularColor = vec3(1.0);
  float shininess = 256.0;

  vec3 position = reconstructPositionFromDepth(vTexCoord, readDepth(depthMap, vTexCoord));

  vec3 N = normalize(normal - 0.5);
  vec3 L = normalize(ecLighPos - position.xyz);
  vec3 E = normalize(-position); //viewDir

  float NdotL = clamp(dot(N, L), 0.0, 1.0);

  float lightDistance = length(ecLighPos - position.xyz);

  //Based on "Real Shading in Unreal Engine 4"
  float lightFalloff = pow(clamp(1.0 - pow(lightDistance/lightRadius, 4.0), 0.0, 1.0), 2.0) / (pow(lightDistance, 2.0) + 1.0);

  vec3 diffuse = 1.0 / PI * albedoColor * lightBrightness * lightColor.rgb * lightFalloff * clamp(NdotL, 0.0, 1.0);

  float specularTerm = blinnPhong(L, E, N);

  vec3 specular = max(pow(specularTerm, shininess), 0.0) * specularColor * lightFalloff;

  gl_FragColor.rgb = diffuse + specular;

  if (showInfluence) {
    gl_FragColor.rgb = vec3(0.2, 0.0, 0.0);
    if (showFalloff) {
      gl_FragColor.rgb = vec3(0.5, 0.0, 0.0) * lightFalloff;
    }
  }

  if (showLightOnly) {
    gl_FragColor.rgb = normal;
    if (showFalloff) {
      gl_FragColor.rgb = vec3(1.0 / PI * lightBrightness * lightFalloff * clamp(NdotL, 0.0, 1.0) + specular);
    }
  }

  gl_FragColor.a = 1.0;
}

#endif