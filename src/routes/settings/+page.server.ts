import type { PageServerLoad, Actions } from './$types';
import * as db from '$lib/server';

export const load: PageServerLoad = async ({ platform }) => {
  const database = platform?.env?.DB;
  
  if (!database) {
    console.log('⚠️ Database not available.');
    return { printModules: [], spoolPresets: [], availableImages: [] };
  }

  const printModules = await db.getAllPrintModules(database);
  const spoolPresets = await db.getAllSpoolPresets(database);
  
  // ✅ List of available images in static/images/
  const availableImages = [
    'haken.JPG',
    'hakenhalter.JPG',
    'klohalter.JPG',
    'stab.JPG',
    'stöpsel.JPG',
    'vase.JPG'
  ];

  return { printModules, spoolPresets, availableImages };
};

export const actions: Actions = {
  addModule: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const imagePath = formData.get('imagePath') as string;
    
    // ✅ Only set imagePath if something was selected (not empty string)
    const normalizedImagePath = imagePath && imagePath !== '' ? `/images/${imagePath}` : null;

    const result = await db.createPrintModule(database, {
      name: formData.get('name') as string,
      expectedWeight: Number(formData.get('expectedWeight')),
      expectedTime: Number(formData.get('expectedTime')),
      objectsPerPrint: Number(formData.get('objectsPerPrint')) || 1,
      defaultSpoolPresetId: Number(formData.get('defaultSpoolPresetId')) || null,
      path: formData.get('path') as string,
      imagePath: normalizedImagePath  // ✅ Will be null if not selected
    });

    return result;
  },

  deleteModule: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();
    const moduleId = Number(formData.get('moduleId'));

    const result = await db.deletePrintModule(database, moduleId);

    return result;
  },

  addSpoolPreset: async ({ platform, request }) => {
    const database = platform?.env?.DB;
    
    if (!database) {
      return { success: false, error: 'Database not available' };
    }

    const formData = await request.formData();

    const result = await db.createSpoolPreset(database, {
      name: formData.get('name') as string,
      brand: formData.get('brand') as string,
      material: formData.get('material') as string,
      color: formData.get('color') as string || null,
      defaultWeight: Number(formData.get('defaultWeight')),
      cost: Number(formData.get('cost')) || null
    });

    return result;
  }
};