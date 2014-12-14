var sys = require('pex-sys');
var glu = require('pex-glu');
var materials = require('pex-materials');
var color = require('pex-color');
var gen = require('pex-gen');
var geom = require('pex-geom');
var fx = require('pex-fx');
var gui = require('pex-gui');
var random = require('pex-random');

var Box                 = gen.Box;
var Sphere              = gen.Sphere;
var Dodecahedron        = gen.Dodecahedron;
var Tetrahedron         = gen.Tetrahedron;
var HexSphere           = gen.HexSphere;
var Mesh                = glu.Mesh;
var PerspectiveCamera   = glu.PerspectiveCamera;
var Arcball             = glu.Arcball;
var ShowNormals         = materials.ShowNormals;
var SolidColor          = materials.SolidColor;
var ShowDepth           = materials.ShowDepth;
var ShowPosition        = materials.ShowPosition;
var Color               = color.Color;
var Platform            = sys.Platform;
var Time                = sys.Time;
var Vec3                = geom.Vec3;
var Quat                = geom.Quat;
var GUI                 = gui.GUI;
var DeferredPointLight  = require('./materials/DeferredPointLight');

var UP = new Vec3(0, 1, 0);

var degToRad = 1/180.0 * Math.PI;

function evalPos(theta, phi) {
  var pos = new Vec3();
  pos.x = Math.sin(theta * degToRad) * Math.sin(phi * degToRad);
  pos.y = Math.cos(theta * degToRad);
  pos.z = Math.sin(theta * degToRad) * Math.cos(phi * degToRad);
  return pos;
}

sys.Window.create({
  settings: {
    width: 1280,
    height: 720,
    type: '3d',
    fullscreen: Platform.isBrowser,
    highdpi: 1,
    borderless: true
  },
  animate: true,
  lightRadius: 0.95,
  maxNumLights: Platform.isMobile ? 20 : 100,
  numSelectedLights: Platform.isMobile ? 20 : 50,
  stage: 'final',
  init: function() {
    if (Platform.isBrowser) {
      console.log('OES_texture_float', this.gl.getExtension("OES_texture_float"));
      console.log('OES_texture_float_linear', this.gl.getExtension("OES_texture_float_linear"));
      console.log('OES_texture_half_float', this.gl.getExtension("OES_texture_half_float"));
      console.log('OES_texture_half_float_linear', this.gl.getExtension("OES_texture_half_float_linear"));
    }
    this.gui = new GUI(this);
    this.gui.addParam('Animate', this, 'animate');
    this.gui.addParam('Num Lights', this, 'numSelectedLights', { min: 0, max: this.maxNumLights, step: 1});
    this.gui.addParam('Light radius', this, 'lightRadius', { min: 0, max: 3});
    this.gui.addRadioList('Stage', this, 'stage', [
      { name: '0 Colors', value: 'colors' },
      { name: '1 Normals', value: 'normals' },
      { name: '2 Depth', value: 'depth' },
      { name: '3 Deferred', value: 'deferred' },
      { name: '4 Deferred with light proxies', value: 'deferredWithLightProxies' },
      { name: '5 Lights spheres', value: 'lightsSpheres' },
      { name: '6 Lights influence', value: 'lightsInfluence' },
      { name: '7 Lights influence add', value: 'lightsInfluenceAdd' },
      { name: '8 Lights influence crop', value: 'lightsInfluenceCrop' },
      { name: '9 Lights influence falloff', value: 'lightsInfluenceFalloff' },
      { name: '10 Lights shading', value: 'lightsShaded' },
      { name: '11 Final', value: 'final' }
    ]);

    this.on('keyDown', function(e) {
      if (e.str == 'g') {
        this.gui.enabled = !this.gui.enabled;
      }
    }.bind(this))

    this.scene = [];

    random.seed(1);

    var star = new Box().catmullClark().extrude(1).catmullClark().extrude().catmullClark();
    star.computeNormals();
    this.starMesh = new Mesh(star, null);
    this.scene.push(this.starMesh);

    var tetra = new Tetrahedron(0.6).dooSabin().triangulate().catmullClark();
    tetra.computeNormals();
    this.tetras = [];
    for(var i=0; i<50; i++) {
      var m = new Mesh(tetra, null);
      m.radius = random.float(2, 6);
      m.theta = random.float(0, 180);
      m.phi = random.float(0, 360);
      m.rotation = Quat.fromDirection(random.vec3().normalize());
      this.scene.push(m);
      this.tetras.push(m);
    }

    this.camera = new PerspectiveCamera(60, 2/1, 1, 20);
    this.arcball = new Arcball(this, this.camera, 5);

    this.lightPos = new Vec3(3, 3, 3);
    this.lightBrightness = 5;
    this.solidColor = new SolidColor();

    this.lights = [];
    for(var i=0; i<this.maxNumLights; i++) {
      numSelectedLights: 50
      this.lights.push({
        position: new Vec3(0, 0, 0),
        t: 0,
        dt: random.float(0, 1),
        k1: random.float(0, 5),
        k2: random.float(0, 5),
        r: random.float(1, 3),
        uniforms: {
          color: Color.fromHSL(random.float(0.6, 0.79), 0.5, 0.5)
        }
      });
    }

    this.lightMesh = new Mesh(new Sphere(0.05), new SolidColor());

    this.deferredPointLight = new DeferredPointLight();
    this.pointLightSpheres = new ShowNormals();
    this.lightProxyMesh = new Mesh(new Sphere(this.lightRadius, 64, 64), this.deferredPointLight);
  },
  drawColor: function() {
    if (!this.solidColor) {
      this.solidColor = new SolidColor({ color: Color.White });
    }
    this.drawScene(this.solidColor);
  },
  drawNormals: function() {
    if (!this.showNormals) {
      this.showNormals = new ShowNormals({ color: Color.Red });
    }
    this.drawScene(this.showNormals);
  },
  drawDepth: function() {
    var gl = this.gl;
    gl.clearColor(1,1,1,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.showDepth) {
      this.showDepth = new ShowDepth();
    }
    this.showDepth.uniforms.near = this.camera.getNear();
    this.showDepth.uniforms.far = this.camera.getFar();
    this.drawScene(this.showDepth);
  },
  drawScene: function(material) {
    this.scene.forEach(function(m) {
      m.setMaterial(material);
      m.draw(this.camera);
    }.bind(this));
  },
  drawDeferredLights: function() {
    glu.clearColorAndDepth(new Color(0.01, 0.01, 0.01, 1.0));
    glu.enableDepthReadAndWrite(false, false);
    if (['final', 'lightsInfluenceAdd', 'lightsInfluenceFalloff', 'lightsShaded', 'lightsInfluenceCrop'].indexOf(this.stage) != -1) glu.enableAdditiveBlending(true);

    var gl = this.gl;

    gl.colorMask(0, 0, 0, 0);
    glu.enableDepthReadAndWrite(true);
    gl.depthFunc(gl.LEQUAL);
    if (this.stage == 'final' || this.stage == 'lightsShaded' || this.stage == 'lightsInfluenceCrop') this.drawScene(this.solidColor); //just depth
    gl.colorMask(1, 1, 1, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    gl.cullFace(gl.FRONT);
    if (this.stage == 'final' || this.stage == 'lightsShaded' || this.stage == 'lightsInfluenceCrop') gl.depthFunc(gl.GREATER);

    for(var i=0; i<this.lights.length; i++) {
      this.lights[i].uniforms.lightPos = this.lights[i].position;
      this.lights[i].uniforms.lightColor = this.lights[i].uniforms.color;
    }
    glu.enableDepthReadAndWrite(true, false);

    if (this.stage == 'lightsSpheres') this.lightProxyMesh.setMaterial(this.pointLightSpheres);
    else this.lightProxyMesh.setMaterial(this.deferredPointLight);

    if (this.stage == 'deferred' || this.stage == 'deferredWithLightProxies') {
      this.deferredPointLight.uniforms.lightRadius = 10;
      this.lightProxyMesh.position.set(-1, -1, 2);
      this.deferredPointLight.uniforms.lightPos = this.lightProxyMesh.position;
      this.lightProxyMesh.scale.set(5, 5, 5);
      //this.deferredPointLight.uniforms.showInfluence = true;
      this.lightProxyMesh.draw(this.camera);
      this.lightProxyMesh.scale.set(1, 1, 1);

      this.lightMesh.drawInstances(this.camera, [{
        position: this.lightProxyMesh.position,
        uniforms: {
          color: Color.White
        }
      }]);

      this.lightProxyMesh.position.set(0, 0, 0);
    }
    else {
      this.lightProxyMesh.drawInstances(this.camera, this.lights.slice(0, this.numSelectedLights));
    }

    glu.enableBlending(false);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  },
  update: function() {
    if (!this.time) {
      this.time = 0;
    }
    if (this.animate) {
      this.time += Time.delta;
    }
    this.lights.forEach(function(light) {
      light.position.x = light.r * Math.sin(this.time + light.k1)
      light.position.y = light.r * Math.cos(this.time + light.k2)
      light.position.z = light.r * Math.sin(this.time + 0.5 * light.k2) + Math.sin(this.time + light.k1)
    }.bind(this));

    this.starMesh.rotation.setAxisAngle(UP, this.time * 20);
    this.tetras.forEach(function(tetra) {
      tetra.position = evalPos(tetra.theta, tetra.phi - this.time * 20).scale(tetra.radius);
    }.bind(this))
  },
  draw: function() {
    Time.verbose = true;
    this.update();

    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    glu.cullFace(true);

    var W = Platform.isMobile ? 2048 : 1024;
    var H = Platform.isMobile ? 1024 : 512;
    var BPP = 32;

    var root = fx();
    var color = root.render({ drawFunc: this.drawColor.bind(this), depth: true, width: W, height: H, bpp: BPP });
    var normals = root.render({ drawFunc: this.drawNormals.bind(this), depth: true, width: W, height: H, bpp: BPP });
    var depth = root.render({ drawFunc: this.drawDepth.bind(this), depth: true, width: W, height: H, bpp: 32 });
    this.deferredPointLight.uniforms.wrap = this.wrap;
    this.deferredPointLight.uniforms.albedoMap = color.getSourceTexture();
    this.deferredPointLight.uniforms.normalMap = normals.getSourceTexture();
    this.deferredPointLight.uniforms.depthMap = depth.getSourceTexture();
    this.deferredPointLight.uniforms.fov = this.camera.getFov();
    this.deferredPointLight.uniforms.near = this.camera.getNear();
    this.deferredPointLight.uniforms.far = this.camera.getFar();
    this.deferredPointLight.uniforms.aspectRatio = this.camera.getAspectRatio();
    this.deferredPointLight.uniforms.lightPos = new Vec3(0, 0, 0);
    this.deferredPointLight.uniforms.lightBrightness = this.lightBrightness;
    this.deferredPointLight.uniforms.lightColor = Color.White;
    this.deferredPointLight.uniforms.lightRadius = this.lightRadius;
    this.deferredPointLight.uniforms.showInfluence = this.stage == 'lightsInfluence' || this.stage == 'lightsInfluenceAdd' || this.stage == 'lightsInfluenceFalloff' || this.stage == 'lightsInfluenceCrop';
    this.deferredPointLight.uniforms.showFalloff = this.stage == 'lightsInfluenceFalloff' || this.stage == 'lightsShaded';
    this.deferredPointLight.uniforms.showLightOnly = this.stage == 'lightsShaded';
    var lights = root.render({ drawFunc: this.drawDeferredLights.bind(this), depth: true, width: W, height: H, bpp: BPP });
    var finalColor;

    var scale = Math.max(this.width / W, this.height / H);

    if (this.stage == 'colors') finalColor = color;
    else if (this.stage == 'normals') finalColor = normals;
    else if (this.stage == 'depth') finalColor = depth;
    else finalColor = lights;

    //finalColor = color;
    //finalColor = normals;
    finalColor.blit({ x : (this.width - W * scale)/2, y: (this.height - H * scale)/2, width : W * scale, height: H * scale});

    glu.viewport((this.width - W * scale)/2, (this.height - H * scale)/2, W * scale, H * scale);

    this.gl.colorMask(0, 0, 0, 0);
    glu.enableDepthReadAndWrite(true);
    this.drawScene(this.solidColor);
    this.gl.colorMask(1, 1, 1, 1);
    this.lightProxyMesh.scale.set(this.lightRadius, this.lightRadius, this.lightRadius);

    if (['colors', 'normals', 'depth', 'deferred'].indexOf(this.stage) == -1) {
      this.lightMesh.drawInstances(this.camera, this.lights.slice(0, this.numSelectedLights));
    }

    //back to fullscreen viewport for the gui
    glu.viewport(0, 0, this.width, this.height);
    if (this.gui.enabled) this.gui.draw();
  }
});
