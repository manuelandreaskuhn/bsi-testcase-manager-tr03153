/**
 * XML Parsing and Building Utilities
 * Handles TestCase and Profile XML operations
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

/**
 * Helper to parse RefFunction/RefUser arrays
 */
function parseRefArray(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(r => typeof r === 'string' ? r : (r._ || r)).filter(Boolean);
}

/**
 * Parse a TestCase XML file
 * @param {string} filePath - Path to the XML file
 * @returns {Object} Parsed testcase data
 */
async function parseTestcaseXML(filePath) {
  const xmlContent = await fs.readFile(filePath, 'utf-8');
  const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$', charkey: '_' });
  
  const result = await parser.parseStringPromise(xmlContent);
  const tc = result.TestCase;
  
  // Parse RefFunction and RefUser on TestCase level
  const refFunctions = parseRefArray(tc.RefFunction);
  const refUsers = parseRefArray(tc.RefUser);
  
  // Parse TestSteps
  const testSteps = [];
  const rawSteps = tc.TestSteps?.TestStep;
  const stepArray = Array.isArray(rawSteps) ? rawSteps : (rawSteps ? [rawSteps] : []);
  
  for (let i = 0; i < stepArray.length; i++) {
    const step = stepArray[i];
    
    // Parse ExpectedResults
    const expectedResults = [];
    const rawResults = step.ExpectedResults?.ExpectedResult;
    const resultsArray = Array.isArray(rawResults) ? rawResults : (rawResults ? [rawResults] : []);
    
    for (let j = 0; j < resultsArray.length; j++) {
      const er = resultsArray[j];
      const text = typeof er === 'string' ? er : (er._ || er);
      // Parse variables attribute (format: "var1=value1,var2=value2")
      const variablesStr = (typeof er === 'object' ? er.$?.variables : '') || '';
      const variables = {};
      if (variablesStr) {
        variablesStr.split(',').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) variables[key.trim()] = value || '';
        });
      }
      expectedResults.push({
        id: `er-${i + 1}-${j + 1}`,
        text: text,
        status: (typeof er === 'object' ? er.$?.status : null) || null,
        actualResult: (typeof er === 'object' ? er.$?.actualResult : '') || '',
        variables: variables
      });
    }
    
    // Parse RefFunction and RefUser on TestStep level
    const stepRefFunctions = parseRefArray(step.RefFunction);
    const stepRefUsers = parseRefArray(step.RefUser);
    
    testSteps.push({
      id: step.$?.id || `step-${i + 1}`,
      number: i + 1,
      command: step.Command || step.Action || '',
      expectedResults: expectedResults,
      status: step.$?.status || null,
      errorMessage: step.ErrorMessage || '',
      refFunctions: stepRefFunctions,
      refUsers: stepRefUsers
    });
  }
  
  // Parse Profiles
  const rawProfiles = tc.Profiles?.Profile;
  const profiles = Array.isArray(rawProfiles) ? rawProfiles : (rawProfiles ? [rawProfiles] : []);
  
  // Parse References
  const rawRefs = tc.References?.Reference;
  const references = Array.isArray(rawRefs) ? rawRefs : (rawRefs ? [rawRefs] : []);
  
  // Parse Preconditions
  let preconditions = [];
  if (tc.Preconditions) {
    const rawPc = tc.Preconditions.Precondition;
    if (rawPc) {
      preconditions = Array.isArray(rawPc) ? rawPc : [rawPc];
    }
  }
  
  // Parse Notes
  let notes = [];
  if (tc.Notes) {
    if (typeof tc.Notes === 'string') {
      if (tc.Notes.trim()) {
        notes = [{ text: tc.Notes, timestamp: null, author: '' }];
      }
    } else if (tc.Notes.Note) {
      const rawNotes = Array.isArray(tc.Notes.Note) ? tc.Notes.Note : [tc.Notes.Note];
      notes = rawNotes.map(n => ({
        text: typeof n === 'string' ? n : (n._ || n),
        timestamp: (typeof n === 'object' ? n.$?.timestamp : null) || null,
        author: (typeof n === 'object' ? n.$?.author : '') || ''
      }));
    }
  }
  
  // Parse Attachments
  let attachments = [];
  if (tc.Attachments?.Attachment) {
    const rawAttachments = Array.isArray(tc.Attachments.Attachment) 
      ? tc.Attachments.Attachment 
      : [tc.Attachments.Attachment];
    attachments = rawAttachments.map(a => ({
      filename: a.$?.filename || '',
      originalName: a.$?.originalName || a.$?.filename || '',
      timestamp: a.$?.timestamp || null,
      description: a.$?.description || '',
      mimeType: a.$?.mimeType || '',
      size: parseInt(a.$?.size) || 0
    }));
  }
  
  return {
    id: tc.$?.id || path.basename(filePath, '.xml'),
    version: tc.Version || '1.0',
    status: tc.$?.status || null,
    title: tc.Title || '',
    purpose: tc.Purpose || '',
    preconditions: preconditions,
    profiles: profiles,
    references: references,
    refFunctions: refFunctions,
    refUsers: refUsers,
    testSteps: testSteps,
    notes: notes,
    attachments: attachments,
    result: tc.Result || { summary: '', testedBy: '', testedDate: '', comments: '' },
    alternativeTestProcedures: []
  };
}

/**
 * Save TestCase data to XML file
 * @param {string} filePath - Path to save the XML file
 * @param {Object} testcaseData - Testcase data to save
 */
async function saveTestcaseXML(filePath, testcaseData) {
  const testSteps = (testcaseData.testSteps || []).map((step, index) => {
    const expectedResults = (step.expectedResults || []).map(er => {
      // Convert variables object to string format "var1=value1,var2=value2"
      const variablesStr = er.variables ? 
        Object.entries(er.variables)
          .filter(([k, v]) => v) // Only include variables with values
          .map(([k, v]) => `${k}=${v}`)
          .join(',') 
        : '';
      
      if (er.status || er.actualResult || variablesStr) {
        const attrs = { 
          status: er.status || '',
          actualResult: er.actualResult || ''
        };
        if (variablesStr) {
          attrs.variables = variablesStr;
        }
        return {
          $: attrs,
          _: er.text || ''
        };
      }
      return er.text || '';
    });
    
    const stepObj = {
      $: { id: step.id || `step-${index + 1}` },
      Command: step.command || '',
      ExpectedResults: { ExpectedResult: expectedResults }
    };
    
    // Add RefFunction and RefUser on step level
    if (step.refFunctions && step.refFunctions.length > 0) {
      stepObj.RefFunction = step.refFunctions;
    }
    if (step.refUsers && step.refUsers.length > 0) {
      stepObj.RefUser = step.refUsers;
    }
    
    if (step.status) stepObj.$.status = step.status;
    if (step.errorMessage) stepObj.ErrorMessage = step.errorMessage;
    
    return stepObj;
  });
  
  // Build notes
  let notesObj = null;
  if (testcaseData.notes && testcaseData.notes.length > 0) {
    notesObj = {
      Note: testcaseData.notes.map(n => ({
        $: {
          timestamp: n.timestamp || new Date().toISOString(),
          author: n.author || ''
        },
        _: n.text || ''
      }))
    };
  }
  
  // Build attachments
  let attachmentsObj = null;
  if (testcaseData.attachments && testcaseData.attachments.length > 0) {
    attachmentsObj = {
      Attachment: testcaseData.attachments.map(a => ({
        $: {
          filename: a.filename,
          originalName: a.originalName || a.filename,
          timestamp: a.timestamp || new Date().toISOString(),
          description: a.description || '',
          mimeType: a.mimeType || '',
          size: a.size || 0
        }
      }))
    };
  }
  
  // Build result object
  const result = testcaseData.result || {};
  const resultObj = {};
  if (result.Status) resultObj.Status = result.Status;
  if (result.Summary) resultObj.Summary = result.Summary;
  if (result.TestedBy) resultObj.TestedBy = result.TestedBy;
  if (result.TestedDate) resultObj.TestedDate = result.TestedDate;
  if (result.Comments) resultObj.Comments = result.Comments;
  
  const testCase = {
    TestCase: {
      $: { 
        id: testcaseData.id,
        xmlns: 'http://www.bsi.bund.de/TR-03153-1/TS/TestCase',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
      },
      Version: testcaseData.version || '1.0',
      Title: testcaseData.title || '',
      Purpose: testcaseData.purpose || '',
      RefFunction: testcaseData.refFunctions && testcaseData.refFunctions.length > 0 ? testcaseData.refFunctions : undefined,
      RefUser: testcaseData.refUsers && testcaseData.refUsers.length > 0 ? testcaseData.refUsers : undefined,
      Profiles: { 
        Profile: testcaseData.profiles || [] 
      },
      References: { 
        Reference: testcaseData.references || [] 
      },
      Preconditions: { 
        Precondition: testcaseData.preconditions || [] 
      },
      TestSteps: { 
        TestStep: testSteps 
      },
      Result: Object.keys(resultObj).length > 0 ? resultObj : undefined,
      Notes: notesObj,
      Attachments: attachmentsObj
    }
  };
  
  if (testcaseData.status) {
    testCase.TestCase.$.status = testcaseData.status;
  }
  
  const builder = new xml2js.Builder({ 
    headless: false, 
    renderOpts: { pretty: true, indent: '  ', newline: '\n' }
  });
  const xml = builder.buildObject(testCase);
  
  await fs.writeFile(filePath, xml, 'utf-8');
}

/**
 * Helper: Extract text value from XML node (handles { _: 'text' } structure)
 */
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node._) return node._;
  return '';
}

/**
 * Parse ProfileConfiguration XML
 * @param {string} xmlContent - XML content string
 * @returns {Object} Parsed profile configuration
 */
async function parseProfilesXML(xmlContent) {
  const parser = new xml2js.Parser({ 
    explicitArray: false, 
    attrkey: '$',
    charkey: '_',
    explicitCharkey: true
  });
  
  const result = await parser.parseStringPromise(xmlContent);
  const config = result.ProfileConfiguration;
  
  // Parse template configuration
  let templateConfiguration = {};
  if (config.TemplateConfiguration) {
    const tc = config.TemplateConfiguration;
    templateConfiguration = {
      profileFilterMode: extractText(tc.ProfileFilterMode) || 'OR'
    };
  }
  
  // Parse metadata
  const metadata = {
    productName: extractText(config.Metadata?.ProductName),
    manufacturer: extractText(config.Metadata?.Manufacturer),
    productVersion: extractText(config.Metadata?.ProductVersion),
    description: extractText(config.Metadata?.Description),
    testDate: extractText(config.Metadata?.TestDate),
    tester: extractText(config.Metadata?.Tester)
  };
  
  // Parse sections from ChecklistSections (not Sections)
  const sections = [];
  const checklistSections = config.ChecklistSections || config.Sections;
  const rawSections = checklistSections?.Section;
  const sectionArray = Array.isArray(rawSections) ? rawSections : (rawSections ? [rawSections] : []);
  
  for (const section of sectionArray) {
    const sectionData = {
      id: section.$?.id || '',
      title: extractText(section.Title),
      description: extractText(section.Description),
      questions: []  // Frontend expects 'questions' not 'items'
    };
    
    // Parse Questions
    const rawQuestions = section.Question;
    const questionArray = Array.isArray(rawQuestions) ? rawQuestions : (rawQuestions ? [rawQuestions] : []);
    
    for (const question of questionArray) {
      // Parse profileMappings from ProfileMapping (Frontend expects this structure)
      let profileMappings = [];
      if (question.ProfileMapping) {
        const mappings = Array.isArray(question.ProfileMapping) ? question.ProfileMapping : [question.ProfileMapping];
        for (const mapping of mappings) {
          const profiles = [];
          if (mapping.Profile) {
            const profArray = Array.isArray(mapping.Profile) ? mapping.Profile : [mapping.Profile];
            profiles.push(...profArray.map(p => extractText(p)));
          }
          profileMappings.push({
            condition: mapping.$?.condition || 'true',
            profiles: profiles
          });
        }
      }
      
      // Parse dependsOn from DependsOn (Frontend expects object with conditions array, or null)
      let dependsOn = null;
      if (question.DependsOn && question.DependsOn.Condition) {
        const logic = question.DependsOn.$?.logic || 'OR';
        const conditions = Array.isArray(question.DependsOn.Condition) 
          ? question.DependsOn.Condition 
          : [question.DependsOn.Condition];
        
        const parsedConditions = conditions.map(c => ({
          questionId: c.$?.questionId || '',
          values: [extractText(c.Value)]  // Frontend expects 'values' as array
        }));
        
        if (parsedConditions.length > 0) {
          dependsOn = {
            logic: logic,
            conditions: parsedConditions
          };
        }
      }
      
      // Parse answer (Frontend expects this structure)
      let answer = {
        answered: false,
        values: []
      };
      if (question.Answer) {
        answer.answered = question.Answer.$?.answered === 'true';
        const value = extractText(question.Answer.Value);
        if (value) {
          answer.values = [value];
        }
      }
      
      sectionData.questions.push({
        id: question.$?.id || '',
        text: extractText(question.Text),  // Frontend expects 'text' not 'label'
        type: question.$?.type || 'boolean',
        required: question.$?.required === 'true',
        helpText: extractText(question.HelpText),  // Frontend expects 'helpText' not 'info'
        answer: answer,
        profileMappings: profileMappings,
        dependsOn: dependsOn
      });
    }
    
    sections.push(sectionData);
  }
  
  // Parse profile definitions from ProfileCategory structure
  const profileDefinitions = parseProfileDefinitions(config.ProfileDefinitions);
  
  return {
    completed: config.$?.completed === 'true',
    templateConfiguration,
    metadata,
    sections,
    profileDefinitions
  };
}

/**
 * Parse profile list from item (legacy support)
 */
function parseProfiles(profiles) {
  if (!profiles) return [];
  const raw = profiles.Profile;
  return Array.isArray(raw) ? raw : (raw ? [raw] : []);
}

/**
 * Parse dependencies from item (legacy support)
 */
function parseDependencies(deps) {
  if (!deps) return [];
  const raw = deps.Dependency;
  const depsArray = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return depsArray.map(d => ({
    itemId: d.$?.itemId || '',
    requiredValue: d.$?.requiredValue !== 'false'
  }));
}

/**
 * Parse profile definitions from XML (supports ProfileCategory structure)
 */
function parseProfileDefinitions(profileDefs) {
  if (!profileDefs) return [];
  
  const profiles = [];
  
  // Handle ProfileCategory structure (new format)
  if (profileDefs.ProfileCategory) {
    const categories = Array.isArray(profileDefs.ProfileCategory) 
      ? profileDefs.ProfileCategory 
      : [profileDefs.ProfileCategory];
    
    for (const category of categories) {
      const categoryId = category.$?.id || '';
      const categoryTitle = extractText(category.Title) || categoryId;
      
      if (category.Profile) {
        const profArray = Array.isArray(category.Profile) ? category.Profile : [category.Profile];
        for (const p of profArray) {
          profiles.push({
            id: p.$?.id || '',
            name: extractText(p.Name) || p.$?.id || '',
            description: extractText(p.Description),
            category: categoryTitle
          });
        }
      }
    }
  }
  
  // Handle direct Profile structure (old format)
  if (profileDefs.Profile) {
    const rawProfiles = Array.isArray(profileDefs.Profile) ? profileDefs.Profile : [profileDefs.Profile];
    for (const p of rawProfiles) {
      profiles.push({
        id: p.$?.id || '',
        name: extractText(p.Name) || p.$?.id || '',
        description: extractText(p.Description),
        category: extractText(p.Category) || 'Sonstige'
      });
    }
  }
  
  return profiles;
}

/**
 * Build ProfileConfiguration XML from data
 * @param {Object} profilesData - Profile configuration data
 * @returns {string} XML string
 */
function buildProfilesXML(profilesData) {
  // Build template configuration
  const templateConfiguration = profilesData.templateConfiguration 
    ? { ProfileFilterMode: profilesData.templateConfiguration.profileFilterMode || 'OR' }
    : undefined;
  
  // Build metadata
  const metadata = {
    ProductName: profilesData.metadata?.productName || '',
    Manufacturer: profilesData.metadata?.manufacturer || '',
    ProductVersion: profilesData.metadata?.productVersion || '',
    Description: profilesData.metadata?.description || '',
    TestDate: profilesData.metadata?.testDate || '',
    Tester: profilesData.metadata?.tester || ''
  };
  
  // Build sections with Question structure
  // Support both 'questions' (new) and 'items' (legacy) field names
  const sections = (profilesData.sections || []).map(section => {
    const questionsList = section.questions || section.items || [];
    
    const questions = questionsList.map(q => {
      const questionObj = {
        $: { id: q.id, type: q.type || 'boolean' },
        Text: q.text || q.label || ''
      };
      
      if (q.required) questionObj.$.required = 'true';
      if (q.helpText || q.info) questionObj.HelpText = q.helpText || q.info;
      
      // Build DependsOn from dependsOn (object with conditions) or dependencies (legacy array)
      if (q.dependsOn && q.dependsOn.conditions && q.dependsOn.conditions.length > 0) {
        // New format: { logic: 'OR', conditions: [{ questionId, values: [...] }] }
        questionObj.DependsOn = {
          $: { logic: q.dependsOn.logic || 'OR' },
          Condition: q.dependsOn.conditions.map(d => ({
            $: { questionId: d.questionId || '' },
            Value: d.values?.[0] || d.value || 'true'
          }))
        };
      } else if (q.dependencies && q.dependencies.length > 0) {
        // Legacy format: array with itemId/requiredValue
        questionObj.DependsOn = {
          $: { logic: 'OR' },
          Condition: q.dependencies.map(d => ({
            $: { questionId: d.itemId || '' },
            Value: d.requiredValue ? 'true' : 'false'
          }))
        };
      }
      
      // Build Answer from answer or value
      if (q.answer) {
        questionObj.Answer = {
          $: { answered: q.answer.answered ? 'true' : 'false' },
          Value: q.answer.values?.[0] || 'false'
        };
      } else {
        questionObj.Answer = {
          $: { answered: q.value ? 'true' : 'false' },
          Value: q.value ? 'true' : 'false'
        };
      }
      
      // Build ProfileMapping from profileMappings or profiles
      if (q.profileMappings && q.profileMappings.length > 0) {
        questionObj.ProfileMapping = q.profileMappings.map(m => ({
          $: { condition: m.condition || 'true' },
          Profile: m.profiles || []
        }));
      } else if (q.profiles && q.profiles.length > 0) {
        questionObj.ProfileMapping = {
          $: { condition: 'true' },
          Profile: q.profiles
        };
      }
      
      return questionObj;
    });
    
    return {
      $: { id: section.id },
      Title: section.title,
      Description: section.description || '',
      Question: questions
    };
  });
  
  // Build profile definitions grouped by category
  let profileDefinitions = undefined;
  if (profilesData.profileDefinitions && profilesData.profileDefinitions.length > 0) {
    // Group profiles by category
    const categories = {};
    for (const p of profilesData.profileDefinitions) {
      const cat = p.category || 'Sonstige';
      if (!categories[cat]) {
        categories[cat] = { title: cat, profiles: [] };
      }
      categories[cat].profiles.push(p);
    }
    
    profileDefinitions = {
      ProfileCategory: Object.entries(categories).map(([catId, catData]) => ({
        $: { id: catId.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') },
        Title: catData.title,
        Profile: catData.profiles.map(p => ({
          $: { id: p.id },
          Description: p.description || ''
        }))
      }))
    };
  }
  
  const profileConfig = {
    ProfileConfiguration: {
      $: {
        version: '1.0',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:noNamespaceSchemaLocation': '_schema/profiles.xsd',
        completed: profilesData.completed ? 'true' : 'false'
      },
      Metadata: metadata,
      TemplateConfiguration: templateConfiguration,
      ProfileDefinitions: profileDefinitions,
      ChecklistSections: { Section: sections }
    }
  };
  
  const builder = new xml2js.Builder({
    headless: false,
    renderOpts: { pretty: true, indent: '  ', newline: '\n' }
  });
  
  return builder.buildObject(profileConfig);
}

module.exports = {
  parseTestcaseXML,
  saveTestcaseXML,
  parseProfilesXML,
  buildProfilesXML,
  parseProfileDefinitions
};
