import { AIService } from './services/aiService.js';
import { TranslationService } from './services/translationService.js';
import { View } from './views/view.js';
import { FormController } from './controllers/formController.js';

(async function main() {
    // Initialize services and view
    const aiService = new AIService();
    const translationService = new TranslationService();
    const view = new View();
    const controller = new FormController(aiService, translationService, view);
    
    // Set current year
    view.setYear();

    // Always register UI listeners first so file selector keeps working
    // even if requirements checks fail.
    controller.setupEventListeners();

    // Check requirements
    const errors = await aiService.checkRequirements();
    if (errors) {
        view.showError(errors);
        return;
    }

    // Get and initialize AI parameters
    const params = await aiService.getParams();
    view.initializeParameters(params);

    console.log('Application initialized successfully');
})();
