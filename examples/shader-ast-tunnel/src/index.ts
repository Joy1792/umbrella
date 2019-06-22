import { swizzle8 } from "@thi.ng/binary";
import { int32Rgba } from "@thi.ng/color";
import {
    $,
    $x,
    $y,
    add,
    assign,
    atan,
    defn,
    div,
    float,
    FloatSym,
    mul,
    neg,
    pow,
    program,
    ret,
    sym,
    texture,
    vec2,
    Vec2Sym,
    vec4
} from "@thi.ng/shader-ast";
import { targetGLSL } from "@thi.ng/shader-ast-glsl";
import { initRuntime, JS_DEFAULT_ENV, targetJS } from "@thi.ng/shader-ast-js";
import {
    compileModel,
    draw,
    GLSL,
    quad,
    shader,
    texture as glTexture
} from "@thi.ng/webgl";
import TEX_URL from "../assets/tex.jpg";

// set URL hash to "#2d" to enable JS Canvas2D version
const JS_MODE = location.hash.indexOf("2d") >= 0;

// AST compile targets
const GL = targetGLSL(100);
const JS = targetJS();

// https://www.shadertoy.com/view/Ms2SWW (by iq)
const main = defn(
    "vec4",
    "mainImage",
    [
        ["vec2", "fragCoord"],
        ["vec2", "res"],
        ["float", "time"],
        ["sampler2D", "tex"]
    ],
    (frag, res, time, tex) => {
        let p: Vec2Sym;
        let uv: Vec2Sym;
        let r: FloatSym;
        return [
            (p = sym(div(add(neg(res), mul(frag, float(2))), $y(res)))),
            (r = sym(
                pow(
                    add(
                        pow(mul($x(p), $x(p)), float(4)),
                        pow(mul($y(p), $y(p)), float(4))
                    ),
                    float(1 / 8)
                )
            )),
            (uv = sym(
                vec2(
                    add(div(float(0.3), r), time),
                    div(atan(div($y(p), $x(p))), float(Math.PI))
                )
            )),
            ret(vec4(mul($(texture(tex, uv), "xyz"), r), float(1)))
        ];
    }
);

// actual GLSL fragment shader main function
const glslMain = defn("void", "main", [], () => [
    assign(
        sym("vec4", "o_fragColor"),
        main(
            $(GL.gl_FragCoord, "xy"),
            sym("vec2", "u_resolution"),
            sym("float", "u_time"),
            sym("sampler2D", "u_tex")
        )
    )
]);

// assemble all functions in a global scope for code generation...
const shaderProgram = program(main);

console.log("JS");
console.log(JS(shaderProgram));
console.log("GLSL");
console.log(GL(shaderProgram));

const W = 320;
const H = 240;
const size = [W, H];
const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
document.body.appendChild(canvas);
const info = document.createElement("div");
info.innerText = (JS_MODE ? "Canvas2D" : "WebGL") + " version";
document.body.appendChild(info);

const tex = new Image();

// preload texture
const preload = (async () => {
    tex.src = TEX_URL;
    await tex.decode();
})();

if (JS_MODE) {
    //
    // JS Canvas 2D shader emulation from here...
    //
    preload.then(() => {
        const texCanv = document.createElement("canvas");
        const TW = (texCanv.width = tex.width);
        const TH = (texCanv.height = tex.height);
        const texCtx = texCanv.getContext("2d")!;
        texCtx.drawImage(tex, 0, 0);
        const texData = new Uint32Array(
            texCtx!.getImageData(0, 0, TW, TH).data.buffer
        );

        // since texture sampling is not (yet) supported for the JS
        // codegen target, we're patching in a simple wrap-around 2D
        // lookup ourselves...
        JS_DEFAULT_ENV.sampler2D.texture = (_, uv) => {
            let x = ((uv[0] * TW) | 0) % TW;
            let y = ((uv[1] * TH) | 0) % TH;
            x < 0 && (x += TW);
            y < 0 && (y += TH);
            return int32Rgba([], swizzle8(texData[y * TW + x], 0, 3, 2, 1));
        };

        // compile AST to actual JS:
        // under the hood all vector & matrix operations delegate to
        // thi.ng/vectors and thi.ng/matrices packages by default
        const fn = JS.compile(shaderProgram).mainImage;
        const rt = initRuntime({ canvas });
        let time = 0;

        setInterval(() => {
            time += 0.05;
            rt.update((frag) => fn(frag, size, time));
        }, 16);
    });
} else {
    //
    // WebGL mode...
    //
    shaderProgram.body.push(glslMain);
    preload.then(() => {
        const ctx: WebGLRenderingContext = canvas.getContext("webgl")!;
        // build fullscreen quad
        const model = quad(false);
        // set shader
        model.shader = shader(ctx, {
            vs: GL(
                defn("void", "main", [], () => [
                    assign(
                        GL.gl_Position,
                        vec4(sym("vec2", "a_position"), 0, 1)
                    )
                ])
            ),
            fs: GL(shaderProgram).replace(/\};/g, "}"),
            attribs: {
                position: GLSL.vec2
            },
            uniforms: {
                resolution: [GLSL.vec2, [W, H]],
                time: GLSL.float,
                tex: [GLSL.sampler2D, 0]
            }
        });
        model.textures = [glTexture(ctx, { image: tex, filter: ctx.LINEAR })];

        // compile model (attrib buffers)
        compileModel(ctx, model);

        const t0 = Date.now();
        // render loop
        setInterval(() => {
            const time = (Date.now() - t0) * 0.001;
            model.uniforms!.time = time;
            draw(model);
        });
    });
}
