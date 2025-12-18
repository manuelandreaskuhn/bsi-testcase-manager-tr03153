/**
 * File System Utilities
 * Handles directory structure reading, searching, and file operations
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

/**
 * Read folder structure for a testcase instance
 * @param {string} rootPath - Root path of the instance
 * @returns {Object} Structure with modules and categories
 */
async function readFolderStructure(rootPath) {
  const structure = { modules: [] };
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('.') || moduleEntry.name.startsWith('_')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const module = { 
        id: moduleEntry.name, 
        name: moduleEntry.name, 
        path: moduleEntry.name, 
        categories: [] 
      };
      
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('.') || categoryEntry.name.startsWith('_')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const category = { 
          id: categoryEntry.name, 
          name: categoryEntry.name, 
          path: categoryEntry.name, 
          testcases: [] 
        };
        
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          const filePath = path.join(categoryPath, fileEntry.name);
          
          try {
            const xmlContent = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
            const result = await parser.parseStringPromise(xmlContent);
            
            const testCase = result.TestCase;
            const profiles = testCase?.Profiles?.Profile;
            
            // Helper to parse ref arrays
            const parseRefArray = (raw) => {
              if (!raw) return [];
              const arr = Array.isArray(raw) ? raw : [raw];
              return arr.map(r => typeof r === 'string' ? r : (r._ || r)).filter(Boolean);
            };
            
            // Parse RefFunction and RefUser on TestCase level
            const refFunctions = parseRefArray(testCase?.RefFunction);
            const refUsers = parseRefArray(testCase?.RefUser);
            
            // Also collect from TestSteps
            const rawSteps = testCase?.TestSteps?.TestStep;
            const stepArray = Array.isArray(rawSteps) ? rawSteps : (rawSteps ? [rawSteps] : []);
            for (const step of stepArray) {
              refFunctions.push(...parseRefArray(step?.RefFunction));
              refUsers.push(...parseRefArray(step?.RefUser));
            }
            
            // Deduplicate
            const uniqueRefFunctions = [...new Set(refFunctions)];
            const uniqueRefUsers = [...new Set(refUsers)];
            
            // Count notes
            let notesCount = 0;
            if (testCase?.Notes) {
              if (typeof testCase.Notes === 'string' && testCase.Notes.trim()) {
                notesCount = 1;
              } else if (testCase.Notes?.Note) {
                const rawNotes = testCase.Notes.Note;
                notesCount = Array.isArray(rawNotes) ? rawNotes.length : 1;
              }
            }
            
            // Count attachments
            let attachmentsCount = 0;
            if (testCase?.Attachments?.Attachment) {
              const rawAttachments = testCase.Attachments.Attachment;
              attachmentsCount = Array.isArray(rawAttachments) ? rawAttachments.length : 1;
            }
            
            category.testcases.push({
              id: testCase?.$?.id || fileEntry.name.replace('.xml', ''),
              filename: fileEntry.name,
              title: testCase?.Title || fileEntry.name,
              status: testCase?.$?.status || null,
              profiles: profiles ? (Array.isArray(profiles) ? profiles : [profiles]) : [],
              refFunctions: uniqueRefFunctions,
              refUsers: uniqueRefUsers,
              notesCount,
              attachmentsCount
            });
          } catch (parseError) {
            console.warn(`Warning: Could not parse ${filePath}`);
            category.testcases.push({
              id: fileEntry.name.replace('.xml', ''),
              filename: fileEntry.name,
              title: fileEntry.name,
              status: null,
              profiles: [],
              refFunctions: [],
              refUsers: [],
              error: true,
              notesCount: 0,
              attachmentsCount: 0
            });
          }
        }
        
        category.testcases.sort((a, b) => a.id.localeCompare(b.id));
        if (category.testcases.length > 0) {
          module.categories.push(category);
        }
      }
      
      module.categories.sort((a, b) => a.name.localeCompare(b.name));
      if (module.categories.length > 0) {
        structure.modules.push(module);
      }
    }
    
    structure.modules.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error reading folder structure:', error);
    throw error;
  }
  
  return structure;
}

/**
 * Search testcases by query
 * @param {string} rootPath - Root path of the instance
 * @param {string} query - Search query
 * @returns {Array} Matching testcases
 */
async function searchTestcases(rootPath, query) {
  const results = [];
  const lowerQuery = query.toLowerCase();
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('.') || moduleEntry.name.startsWith('_')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('.') || categoryEntry.name.startsWith('_')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          try {
            const filePath = path.join(categoryPath, fileEntry.name);
            const xmlContent = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
            const result = await parser.parseStringPromise(xmlContent);
            const tc = result.TestCase;
            
            const id = tc?.$?.id || fileEntry.name.replace('.xml', '');
            const title = tc?.Title || '';
            const purpose = tc?.Purpose || '';
            
            // Helper to parse ref arrays
            const parseRefArray = (raw) => {
              if (!raw) return [];
              const arr = Array.isArray(raw) ? raw : [raw];
              return arr.map(r => typeof r === 'string' ? r : (r._ || r)).filter(Boolean);
            };
            
            // Parse RefFunction and RefUser
            const refFunctions = parseRefArray(tc?.RefFunction);
            const refUsers = parseRefArray(tc?.RefUser);
            
            // Also collect from TestSteps
            const rawSteps = tc?.TestSteps?.TestStep;
            const stepArray = Array.isArray(rawSteps) ? rawSteps : (rawSteps ? [rawSteps] : []);
            for (const step of stepArray) {
              refFunctions.push(...parseRefArray(step?.RefFunction));
              refUsers.push(...parseRefArray(step?.RefUser));
            }
            
            // Deduplicate
            const uniqueRefFunctions = [...new Set(refFunctions)];
            const uniqueRefUsers = [...new Set(refUsers)];
            
            // Check if query matches (including hashtags)
            const refFunctionsMatch = uniqueRefFunctions.some(rf => rf.toLowerCase().includes(lowerQuery));
            const refUsersMatch = uniqueRefUsers.some(ru => ru.toLowerCase().includes(lowerQuery));
            
            if (
              id.toLowerCase().includes(lowerQuery) ||
              title.toLowerCase().includes(lowerQuery) ||
              purpose.toLowerCase().includes(lowerQuery) ||
              refFunctionsMatch ||
              refUsersMatch
            ) {
              const profiles = tc?.Profiles?.Profile;
              
              // Determine match type for highlighting
              let matchType = 'purpose';
              if (id.toLowerCase().includes(lowerQuery)) matchType = 'id';
              else if (title.toLowerCase().includes(lowerQuery)) matchType = 'title';
              else if (refFunctionsMatch) matchType = 'refFunction';
              else if (refUsersMatch) matchType = 'refUser';
              
              results.push({
                id,
                filename: fileEntry.name,
                title,
                purpose,
                status: tc?.$?.status || null,
                profiles: profiles ? (Array.isArray(profiles) ? profiles : [profiles]) : [],
                refFunctions: uniqueRefFunctions,
                refUsers: uniqueRefUsers,
                module: moduleEntry.name,
                category: categoryEntry.name,
                matchType
              });
            }
          } catch (err) {
            // Skip files that can't be parsed
          }
        }
      }
    }
  } catch (error) {
    console.error('Error searching testcases:', error);
    throw error;
  }
  
  return results;
}

/**
 * Get dashboard data with statistics
 * @param {string} rootPath - Root path of the instance
 * @returns {Object} Dashboard data with statistics
 */
async function getDashboardData(rootPath) {
  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    open: 0,
    byModule: {},
    byProfile: {},
    recentlyModified: [],
    recentNotes: [],
    recentAttachments: []
  };
  
  const allNotes = [];
  const allAttachments = [];
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('.') || moduleEntry.name.startsWith('_')) {
        continue;
      }
      
      const moduleName = moduleEntry.name;
      stats.byModule[moduleName] = { total: 0, passed: 0, failed: 0, skipped: 0, open: 0 };
      
      const modulePath = path.join(rootPath, moduleName);
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('.') || categoryEntry.name.startsWith('_')) {
          continue;
        }
        
        const categoryName = categoryEntry.name;
        const categoryPath = path.join(modulePath, categoryName);
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          try {
            const filePath = path.join(categoryPath, fileEntry.name);
            const xmlContent = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
            const result = await parser.parseStringPromise(xmlContent);
            const tc = result.TestCase;
            
            const testcaseId = tc?.$?.id || fileEntry.name.replace('.xml', '');
            
            stats.total++;
            stats.byModule[moduleName].total++;
            
            const status = tc?.$?.status || 'OPEN';
            if (status === 'PASSED') {
              stats.passed++;
              stats.byModule[moduleName].passed++;
            } else if (status === 'FAILED') {
              stats.failed++;
              stats.byModule[moduleName].failed++;
            } else if (status === 'SKIPPED') {
              stats.skipped++;
              stats.byModule[moduleName].skipped++;
            } else {
              stats.open++;
              stats.byModule[moduleName].open++;
            }
            
            // Count by profile
            const profiles = tc?.Profiles?.Profile;
            if (profiles) {
              const profileArray = Array.isArray(profiles) ? profiles : [profiles];
              for (const profile of profileArray) {
                if (!stats.byProfile[profile]) {
                  stats.byProfile[profile] = { total: 0, passed: 0, failed: 0, skipped: 0, open: 0 };
                }
                stats.byProfile[profile].total++;
                if (status === 'PASSED') stats.byProfile[profile].passed++;
                else if (status === 'FAILED') stats.byProfile[profile].failed++;
                else if (status === 'SKIPPED') stats.byProfile[profile].skipped++;
                else stats.byProfile[profile].open++;
              }
            }
            
            // Collect notes
            if (tc?.Notes?.Note) {
              const notes = Array.isArray(tc.Notes.Note) ? tc.Notes.Note : [tc.Notes.Note];
              for (const note of notes) {
                const noteText = typeof note === 'string' ? note : (note._ || note.text || note);
                const timestamp = typeof note === 'object' ? (note.$?.timestamp || note.timestamp) : null;
                if (noteText && typeof noteText === 'string' && noteText.trim()) {
                  allNotes.push({
                    testcaseId,
                    module: moduleName,
                    category: categoryName,
                    filename: fileEntry.name,
                    text: noteText.trim(),
                    timestamp: timestamp || null
                  });
                }
              }
            }
            
            // Collect attachments
            if (tc?.Attachments?.Attachment) {
              const attachments = Array.isArray(tc.Attachments.Attachment) ? tc.Attachments.Attachment : [tc.Attachments.Attachment];
              for (const att of attachments) {
                // Attachments have data in attributes ($.filename, $.timestamp, etc.)
                const filename = typeof att === 'string' ? att : (att.$?.filename || att.$?.originalName || att._ || '');
                const originalName = typeof att === 'object' ? (att.$?.originalName || att.$?.filename || '') : att;
                const timestamp = typeof att === 'object' ? att.$?.timestamp : null;
                const mimeType = typeof att === 'object' ? att.$?.mimeType : null;
                if (filename && typeof filename === 'string' && filename.trim()) {
                  allAttachments.push({
                    testcaseId,
                    module: moduleName,
                    category: categoryName,
                    testcaseFilename: fileEntry.name,
                    filename: filename.trim(),
                    originalName: originalName || filename,
                    mimeType: mimeType || '',
                    timestamp: timestamp || null
                  });
                }
              }
            }
          } catch (err) {
            // Skip files that can't be parsed
          }
        }
      }
    }
    
    // Sort notes by timestamp (newest first) and take top 20
    allNotes.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    stats.recentNotes = allNotes.slice(0, 20);
    
    // Sort attachments by timestamp (newest first) and take top 20
    allAttachments.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    stats.recentAttachments = allAttachments.slice(0, 20);
    
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    throw error;
  }
  
  return stats;
}

/**
 * Get profiles structure (testcases grouped by profile)
 * @param {string} rootPath - Root path of the instance
 * @returns {Object} Profiles with their testcases
 */
async function getProfilesStructure(rootPath) {
  const profiles = {};
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('.') || moduleEntry.name.startsWith('_')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('.') || categoryEntry.name.startsWith('_')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          try {
            const filePath = path.join(categoryPath, fileEntry.name);
            const xmlContent = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
            const result = await parser.parseStringPromise(xmlContent);
            const tc = result.TestCase;
            
            const tcProfiles = tc?.Profiles?.Profile;
            if (tcProfiles) {
              const profileArray = Array.isArray(tcProfiles) ? tcProfiles : [tcProfiles];
              
              for (const profile of profileArray) {
                if (!profiles[profile]) {
                  profiles[profile] = {
                    id: profile,
                    name: profile,
                    testcases: [],
                    stats: { total: 0, passed: 0, failed: 0, skipped: 0, open: 0 }
                  };
                }
                
                const status = tc?.$?.status || 'OPEN';
                profiles[profile].stats.total++;
                if (status === 'PASSED') profiles[profile].stats.passed++;
                else if (status === 'FAILED') profiles[profile].stats.failed++;
                else if (status === 'SKIPPED') profiles[profile].stats.skipped++;
                else profiles[profile].stats.open++;
                
                profiles[profile].testcases.push({
                  id: tc?.$?.id || fileEntry.name.replace('.xml', ''),
                  filename: fileEntry.name,
                  title: tc?.Title || '',
                  status,
                  module: moduleEntry.name,
                  category: categoryEntry.name,
                  profiles: profileArray
                });
              }
            }
          } catch (err) {
            // Skip files that can't be parsed
          }
        }
      }
    }
  } catch (error) {
    console.error('Error getting profiles structure:', error);
    throw error;
  }
  
  // Sort testcases within each profile
  for (const profile of Object.values(profiles)) {
    profile.testcases.sort((a, b) => a.id.localeCompare(b.id));
  }
  
  return profiles;
}

/**
 * Get hashtags structure (testcases grouped by RefFunction and RefUser)
 * @param {string} rootPath - Root path of the instance
 * @returns {Object} Hashtags with their testcases
 */
async function getHashtagsStructure(rootPath) {
  const hashtags = {
    functions: {},
    users: {}
  };
  
  // Helper to parse ref arrays
  const parseRefArray = (raw) => {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(r => typeof r === 'string' ? r : (r._ || r)).filter(Boolean);
  };
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('.') || moduleEntry.name.startsWith('_')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('.') || categoryEntry.name.startsWith('_')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          try {
            const filePath = path.join(categoryPath, fileEntry.name);
            const xmlContent = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false, attrkey: '$' });
            const result = await parser.parseStringPromise(xmlContent);
            const tc = result.TestCase;
            
            // Collect RefFunction and RefUser
            const refFunctions = parseRefArray(tc?.RefFunction);
            const refUsers = parseRefArray(tc?.RefUser);
            
            // Also collect from TestSteps
            const rawSteps = tc?.TestSteps?.TestStep;
            const stepArray = Array.isArray(rawSteps) ? rawSteps : (rawSteps ? [rawSteps] : []);
            for (const step of stepArray) {
              refFunctions.push(...parseRefArray(step?.RefFunction));
              refUsers.push(...parseRefArray(step?.RefUser));
            }
            
            const status = tc?.$?.status || 'OPEN';
            const tcInfo = {
              id: tc?.$?.id || fileEntry.name.replace('.xml', ''),
              filename: fileEntry.name,
              title: tc?.Title || '',
              status,
              module: moduleEntry.name,
              category: categoryEntry.name
            };
            
            // Add to functions
            const uniqueFunctions = [...new Set(refFunctions)];
            for (const fn of uniqueFunctions) {
              if (!hashtags.functions[fn]) {
                hashtags.functions[fn] = {
                  id: fn,
                  name: fn,
                  type: 'function',
                  testcases: [],
                  stats: { total: 0, passed: 0, failed: 0, skipped: 0, open: 0 }
                };
              }
              hashtags.functions[fn].testcases.push(tcInfo);
              hashtags.functions[fn].stats.total++;
              if (status === 'PASSED') hashtags.functions[fn].stats.passed++;
              else if (status === 'FAILED') hashtags.functions[fn].stats.failed++;
              else if (status === 'SKIPPED') hashtags.functions[fn].stats.skipped++;
              else hashtags.functions[fn].stats.open++;
            }
            
            // Add to users
            const uniqueUsers = [...new Set(refUsers)];
            for (const user of uniqueUsers) {
              if (!hashtags.users[user]) {
                hashtags.users[user] = {
                  id: user,
                  name: user,
                  type: 'user',
                  testcases: [],
                  stats: { total: 0, passed: 0, failed: 0, skipped: 0, open: 0 }
                };
              }
              hashtags.users[user].testcases.push(tcInfo);
              hashtags.users[user].stats.total++;
              if (status === 'PASSED') hashtags.users[user].stats.passed++;
              else if (status === 'FAILED') hashtags.users[user].stats.failed++;
              else if (status === 'SKIPPED') hashtags.users[user].stats.skipped++;
              else hashtags.users[user].stats.open++;
            }
          } catch (err) {
            // Skip files that can't be parsed
          }
        }
      }
    }
  } catch (error) {
    console.error('Error getting hashtags structure:', error);
    throw error;
  }
  
  // Sort testcases within each hashtag
  for (const fn of Object.values(hashtags.functions)) {
    fn.testcases.sort((a, b) => a.id.localeCompare(b.id));
  }
  for (const user of Object.values(hashtags.users)) {
    user.testcases.sort((a, b) => a.id.localeCompare(b.id));
  }
  
  return hashtags;
}

module.exports = {
  readFolderStructure,
  searchTestcases,
  getDashboardData,
  getProfilesStructure,
  getHashtagsStructure
};
