
//Catálogo (acá se agregan modelos)

export const MODELS_PATH = '../Modelos/Assets/';

// Para usar tu base de datos, reemplazala por:
//   const r = await fetch('/api/selfies/random');   
//   return (await r.json()).url;                    
export async function randomSelfieUrl() {
    // const cv = document.createElement('canvas');
    // cv.width = 300; cv.height = 400;
    // const g = cv.getContext('2d');
    // const hue = Math.floor(Math.random() * 360);
    // g.fillStyle = 'hsl(' + hue + ',70%,55%)';
    // g.fillRect(0, 0, 300, 400);
    // g.fillStyle = 'rgba(255,255,255,0.9)';
    // g.font = 'bold 90px sans-serif';
    // g.textAlign = 'center';
    // g.fillText(String(Math.floor(Math.random() * 1000)), 150, 220);
    // return cv.toDataURL('image/png');

    //Cargar imagenes de forma local
    const res = await fetch('../Fotos/selfies.json');
    const nombres = await res.json();
    console.log(nombres);
    const id = Math.round(Math.random() * (nombres.length-1));
    console.log("ID Imagen: " + id);
    const img = '../Fotos/' + nombres[id];
    console.log("URL Imagen: " + img);
    return img;

    //Cargar imagenes desde la API de picsum
    const seed = Math.random().toString(36).slice(2);   
       return 'https://picsum.photos/seed/' + seed + '/300/400';
}

//Orden de importancia: de más grande o raro a menos. 
// Una categoría solo "evita" a las categorías que están antes en la lista.

export const ASSET_CATALOG = [
    {
        id: 'barco', placeholder: 'barco',
        collide: {scale: 0.6},
        models: ['barquito.glb'],
        spacing: 320, density: 0.06, size: [60, 100], sink: 0.15,
        heightRange: [0, 0.35], maxSlope: 0.35, flat: 0.3,
        avoid: {},
    },
    /*{
        id: 'huesos', placeholder: 'huesos',
        collide: {scale: 0.8},
        models: ['pez_abis.glb', 'pez_asal.glb'],
        spacing: 220, density: 0.10, size: [30, 55], sink: 0.10,
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        avoid: {barco: 25},
    },*/
    {
        id: 'selfies', placeholder: 'selfies',
        collide: {scale: 1.0},
        models: [],                                   
        images: {
            aspect: 0.75,
            glowRadius: 90,           // distancia (al borde de la selfie) a la que empieza a iluminarse
            glowIntensity: 0.8,       // brillo propio maximo cuando el pez esta pegado
            baseGlow: 1,            // brillo propio permanente (0 = solo la luz de la escena)
            lifetime: 15,             // segundos SEGUIDOS que el pez debe estar cerca antes de que empiece a desvanecerse
            fadeSeconds: 3,           // duracion del desvanecimiento (la imagen es 'consumida' mientras el pez sigue cerca)
            recoverSeconds: 1.5,      // si el pez se va a mitad del desvanecimiento, en cuanto tarda en recuperarse
            ghostOpacity: 0.25,       // opacidad final: queda traspasable                             
            source: randomSelfieUrl,                  
        },
        spacing: 80, density: 0.20, size: [35, 55], sink: 0.06,   
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        //avoid: {barco: 25, huesos: 20},
        avoid: {barco: 25},
    },
    {
        id: 'coral', placeholder: 'coral',
        collide: {scale: 0.7},
        models: ['Coral1SMALL.glb', 'Coral1MED.glb', 'Coral1BIG.glb', 'Coral1MIX.glb', 'Coral2SMALL.glb', 'Coral2MED.glb', 'Coral2BIG.glb', 'Coral2MIX.glb'],
        spacing: 12, density: 0.10, size: [6, 10], sink: 0.02,
        heightRange: [0, 1.0], maxSlope: 1.2,
        patch: {scale: 90, strength: 0.8},
        //avoid: {barco: 8, huesos: 6},
        avoid: {barco: 8},
    },
    {
        id: 'piedra', placeholder: 'piedra',
        collide: {scale: 0.50},
        models: ['RocaSMALL.glb', 'RocaMED.glb', 'RocaBIG.glb', 'RocaMIX.glb'],
        spacing: 12, density: 0.20, size: [10, 16], sink: 0.25,
        heightRange: [0, 1.0], maxSlope: 1.2,
        patch: {scale: 90, strength: 0.8},
        //avoid: {barco: 8, huesos: 6},
        avoid: {barco: 8},
    },
    {
        id: 'algas', placeholder: 'algas',
        // sin 'collide': el pez atraviesa las algas
        models: ['AlgaSMALL.glb', 'AlgaMED.glb', 'AlgaBIG.glb', 'AlgaMIX.glb'],
        spacing: 6, density: 0.40, size: [30, 50], sink: 0.06,
        heightRange: [0, 0.45], maxSlope: 0.6,
        patch: {scale: 80, strength: 0.9},
        //avoid: {barco: 8, huesos: 6, piedra: 1.5},
        avoid: {barco: 8, piedra: 1.5},
    },
];