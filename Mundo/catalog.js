//Catálogo (acá se agregan modelos)

export const MODELS_PATH = '../Modelos/';

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

    const seed = Math.random().toString(36).slice(2);   
       return 'https://picsum.photos/seed/' + seed + '/300/400';
}

//Orden de importancia: de más grande o raro a menos. 
// Una categoría solo "evita" a las categorías que están antes en la lista.

export const ASSET_CATALOG = [
    {
        id: 'barco', placeholder: 'barco',
        models: ['pe_abisal.glb'],
        spacing: 320, density: 0.06, size: [60, 100], sink: 0.15,
        heightRange: [0, 0.35], maxSlope: 0.35, flat: 0.3,
        avoid: {},
    },
    {
        id: 'huesos', placeholder: 'huesos',
        models: ['pez_abis.glb', 'pez_asal.glb'],
        spacing: 220, density: 0.10, size: [30, 55], sink: 0.10,
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        avoid: {barco: 25},
    },
    {
        id: 'selfies', placeholder: 'selfies',
        models: [],                                   
        images: {
            aspect: 0.75,                             
            source: randomSelfieUrl,                  
        },
        spacing: 160, density: 0.20, size: [30, 55], sink: 0.0,   
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        avoid: {barco: 25, huesos: 20},
    },
    {
        id: 'coral', placeholder: 'coral',
        models: ['Coral1.glb', 'Coral1-Simple.glb', 'Coral2-Simple.glb', 'Coral2.glb'],
        spacing: 12, density: 0.40, size: [1.5, 6], sink: 0.25,
        heightRange: [0, 1.0], maxSlope: 1.2,
        patch: {scale: 90, strength: 0.8},
        avoid: {barco: 8, huesos: 6},
    },
    {
        id: 'piedra', placeholder: 'piedra',
        models: ['Roca1.glb', 'Roca1-Simple.glb', 'Roca2-Simple.glb'],
        spacing: 12, density: 0.40, size: [1.5, 6], sink: 0.25,
        heightRange: [0, 1.0], maxSlope: 1.2,
        patch: {scale: 90, strength: 0.8},
        avoid: {barco: 8, huesos: 6},
    },
    {
        id: 'algas', placeholder: 'algas',
        models: ['pez_aisal.glb', 'pez_abisl.glb'],
        spacing: 6, density: 0.70, size: [8, 16], sink: 0.05,
        heightRange: [0, 0.45], maxSlope: 0.6,
        patch: {scale: 80, strength: 0.9},
        avoid: {barco: 8, huesos: 6, piedra: 1.5},
    },
];