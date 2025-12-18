/**
 * Testcase Utilities
 * Handles testcase ID parsing, variant grouping, and data collection for exports
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

/**
 * Parse testcase ID into components
 * @param {string} id - Testcase ID (e.g., "II_EXF_01" or "II_EXF_01_A")
 * @returns {Object} Parsed ID components
 */
function parseTestcaseId(id) {
  // Match ID with variant (e.g., II_EXF_01_A)
  const matchWithVariant = id.match(/^(.+_)(\d+)_([A-Z]+)$/);
  if (matchWithVariant) {
    return { 
      prefix: matchWithVariant[1], 
      number: parseInt(matchWithVariant[2], 10),
      variant: matchWithVariant[3], 
      baseId: matchWithVariant[1] + matchWithVariant[2],
      hasVariant: true 
    };
  }
  
  // Match ID without variant (e.g., II_EXF_01)
  const matchWithoutVariant = id.match(/^(.+_)(\d+)$/);
  if (matchWithoutVariant) {
    return { 
      prefix: matchWithoutVariant[1], 
      number: parseInt(matchWithoutVariant[2], 10),
      variant: null, 
      baseId: id,
      hasVariant: false 
    };
  }
  
  return { prefix: id, number: 0, variant: null, baseId: id, hasVariant: false };
}

/**
 * Convert variant letter(s) to number (A=1, B=2, ..., Z=26, AA=27, etc.)
 * @param {string} variant - Variant letter(s)
 * @returns {number} Variant number
 */
function variantToNumber(variant) {
  if (!variant) return 0;
  
  if (variant.length === 1) {
    return variant.charCodeAt(0) - 64; // A=1, B=2, etc.
  }
  
  if (variant.length === 2) {
    const first = variant.charCodeAt(0) - 64;
    const second = variant.charCodeAt(1) - 64;
    return 26 + (first - 1) * 26 + second;
  }
  
  // For longer variants (rarely used)
  let result = 26 + 26 * 26;
  for (let i = 0; i < variant.length; i++) {
    result = result * 26 + (variant.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Convert number back to variant letter(s)
 * @param {number} num - Variant number
 * @returns {string|null} Variant letter(s)
 */
function numberToVariant(num) {
  if (num <= 0) return null;
  
  if (num <= 26) {
    return String.fromCharCode(64 + num);
  }
  
  const adjusted = num - 26;
  const first = Math.floor((adjusted - 1) / 26) + 1;
  const second = ((adjusted - 1) % 26) + 1;
  return String.fromCharCode(64 + first) + String.fromCharCode(64 + second);
}

/**
 * Group testcases with their variants and detect gaps
 * @param {Array} testcases - Array of testcase objects
 * @returns {Array} Grouped testcases with gap indicators
 */
function groupTestcasesWithVariants(testcases) {
  const prefixGroups = new Map();
  
  // Group testcases by prefix and number
  testcases.forEach(tc => {
    const parsed = parseTestcaseId(tc.id);
    
    if (!prefixGroups.has(parsed.prefix)) {
      prefixGroups.set(parsed.prefix, new Map());
    }
    
    const numberGroup = prefixGroups.get(parsed.prefix);
    if (!numberGroup.has(parsed.number)) {
      numberGroup.set(parsed.number, { 
        base: null, 
        variants: [], 
        prefix: parsed.prefix, 
        number: parsed.number 
      });
    }
    
    const group = numberGroup.get(parsed.number);
    if (parsed.hasVariant) {
      group.variants.push({ 
        ...tc, 
        _variant: parsed.variant, 
        _variantNum: variantToNumber(parsed.variant), 
        _parsed: parsed 
      });
    } else {
      group.base = { ...tc, _parsed: parsed };
    }
  });

  const result = [];
  const sortedPrefixes = Array.from(prefixGroups.keys()).sort();
  
  sortedPrefixes.forEach(prefix => {
    const numberGroups = prefixGroups.get(prefix);
    const sortedNumbers = Array.from(numberGroups.keys()).sort((a, b) => a - b);
    
    let lastNumber = 0;
    
    sortedNumbers.forEach((num) => {
      const group = numberGroups.get(num);
      
      // Detect gaps in base IDs
      if (lastNumber > 0 && num > lastNumber + 1) {
        const missingCount = num - lastNumber - 1;
        const fromNum = String(lastNumber).padStart(2, '0');
        const toNum = String(num).padStart(2, '0');
        result.push({ 
          type: 'base-gap', 
          prefix: prefix,
          fromNumber: lastNumber,
          toNumber: num,
          fromId: prefix + fromNum,
          toId: prefix + toNum,
          missingCount: missingCount
        });
      }
      lastNumber = num;
      
      // Handle testcases without variants
      if (group.variants.length === 0) {
        if (group.base) {
          result.push({ type: 'testcase', tc: group.base });
        }
      } else {
        // Handle testcases with variants
        const baseId = prefix + String(num).padStart(2, '0');
        result.push({ 
          type: 'group-start', 
          baseId, 
          variantCount: group.variants.length + (group.base ? 1 : 0) 
        });
        
        if (group.base) {
          result.push({ type: 'testcase', tc: group.base, isInGroup: true, isBase: true });
        }
        
        // Sort variants
        group.variants.sort((a, b) => a._variantNum - b._variantNum);
        
        // Detect gaps in variants
        let lastVariantNum = 0;
        group.variants.forEach((variant) => {
          const expectedNext = lastVariantNum + 1;
          if (lastVariantNum > 0 && variant._variantNum > expectedNext) {
            const lastInSingleRange = lastVariantNum <= 26;
            const currentInSingleRange = variant._variantNum <= 26;
            
            if (lastInSingleRange === currentInSingleRange) {
              const gapStart = numberToVariant(lastVariantNum);
              const gapEnd = numberToVariant(variant._variantNum);
              const missingCount = variant._variantNum - lastVariantNum - 1;
              result.push({ 
                type: 'variant-gap', 
                from: gapStart, 
                to: gapEnd,
                missingCount: missingCount
              });
            }
          }
          
          result.push({ 
            type: 'testcase', 
            tc: variant, 
            isInGroup: true, 
            isVariant: true, 
            variant: variant._variant 
          });
          lastVariantNum = variant._variantNum;
        });
        
        result.push({ type: 'group-end' });
      }
    });
  });

  return result;
}

/**
 * Collect all testcases for PDF export
 * @param {string} rootPath - Root path of the instance
 * @param {Array|null} activeProfiles - Active profile filter
 * @param {string} filterMode - 'OR' or 'AND'
 * @returns {Array} Modules with categories and testcases
 */
async function collectAllTestcases(rootPath, activeProfiles = null, filterMode = 'OR') {
  const modules = [];
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('_') || moduleEntry.name.startsWith('.')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const moduleData = {
        name: moduleEntry.name,
        categories: []
      };
      
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('_') || categoryEntry.name.startsWith('.')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const categoryData = {
          name: categoryEntry.name,
          testcases: []
        };
        
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          const filePath = path.join(categoryPath, fileEntry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false });
            const parsed = await parser.parseStringPromise(content);
            const tc = parsed.TestCase;
            
            const profiles = tc.Profiles?.Profile 
              ? (Array.isArray(tc.Profiles.Profile) ? tc.Profiles.Profile : [tc.Profiles.Profile])
              : [];
            
            // Apply profile filter if active
            if (activeProfiles && activeProfiles.length > 0) {
              if (profiles.length > 0) {
                const isActive = filterMode === 'AND'
                  ? profiles.every(p => activeProfiles.includes(p))
                  : profiles.some(p => activeProfiles.includes(p));
                if (!isActive) continue;
              }
            }
            
            // Get status from Result if available
            let status = 'OPEN';
            if (tc.Result?.Status) {
              status = tc.Result.Status;
            }
            
            categoryData.testcases.push({
              id: tc.$.id,
              title: tc.Title || '',
              profiles: profiles,
              status: status
            });
          } catch (parseError) {
            console.warn(`Warning: Could not parse ${filePath}`);
          }
        }
        
        if (categoryData.testcases.length > 0) {
          categoryData.testcases.sort((a, b) => a.id.localeCompare(b.id));
          moduleData.categories.push(categoryData);
        }
      }
      
      if (moduleData.categories.length > 0) {
        moduleData.categories.sort((a, b) => a.name.localeCompare(b.name));
        modules.push(moduleData);
      }
    }
    
    modules.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error collecting testcases:', error);
  }
  
  return modules;
}

/**
 * Collect detailed testcase data for DOCX export
 * @param {string} rootPath - Root path of the instance
 * @param {Array|null} activeProfiles - Active profile filter
 * @param {string} filterMode - 'OR' or 'AND'
 * @returns {Object} Modules, testcases, and statistics
 */
async function collectDetailedTestcases(rootPath, activeProfiles = null, filterMode = 'OR') {
  const modules = [];
  let totalTestcases = 0;
  let statusCounts = { passed: 0, failed: 0, skipped: 0, open: 0 };
  
  try {
    const moduleEntries = await fs.readdir(rootPath, { withFileTypes: true });
    
    for (const moduleEntry of moduleEntries) {
      if (!moduleEntry.isDirectory() || moduleEntry.name.startsWith('_') || moduleEntry.name.startsWith('.')) {
        continue;
      }
      
      const modulePath = path.join(rootPath, moduleEntry.name);
      const moduleData = {
        name: moduleEntry.name,
        categories: [],
        testcaseCount: 0,
        passedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        openCount: 0
      };
      
      const categoryEntries = await fs.readdir(modulePath, { withFileTypes: true });
      
      for (const categoryEntry of categoryEntries) {
        if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith('_') || categoryEntry.name.startsWith('.')) {
          continue;
        }
        
        const categoryPath = path.join(modulePath, categoryEntry.name);
        const categoryData = {
          name: categoryEntry.name,
          testcases: [],
          testcaseCount: 0,
          passedCount: 0,
          failedCount: 0,
          skippedCount: 0,
          openCount: 0
        };
        
        const fileEntries = await fs.readdir(categoryPath, { withFileTypes: true });
        
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.xml')) {
            continue;
          }
          
          const filePath = path.join(categoryPath, fileEntry.name);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parser = new xml2js.Parser({ explicitArray: false });
            const parsed = await parser.parseStringPromise(content);
            const tc = parsed.TestCase;
            
            const profiles = tc.Profiles?.Profile 
              ? (Array.isArray(tc.Profiles.Profile) ? tc.Profiles.Profile : [tc.Profiles.Profile])
              : [];
            
            // Apply profile filter
            if (activeProfiles && activeProfiles.length > 0) {
              if (profiles.length > 0) {
                const isActive = filterMode === 'AND'
                  ? profiles.every(p => activeProfiles.includes(p))
                  : profiles.some(p => activeProfiles.includes(p));
                if (!isActive) continue;
              }
            }
            
            // Get status
            let status = 'OPEN';
            let statusText = 'Offen';
            if (tc.Result?.Status) {
              status = tc.Result.Status;
              if (status === 'PASSED') statusText = 'Bestanden';
              else if (status === 'FAILED') statusText = 'Fehlgeschlagen';
              else if (status === 'SKIPPED') statusText = 'Übersprungen';
            }
            
            // Update counts
            totalTestcases++;
            categoryData.testcaseCount++;
            moduleData.testcaseCount++;
            
            if (status === 'PASSED') { 
              statusCounts.passed++; 
              categoryData.passedCount++; 
              moduleData.passedCount++; 
            } else if (status === 'FAILED') { 
              statusCounts.failed++; 
              categoryData.failedCount++; 
              moduleData.failedCount++; 
            } else if (status === 'SKIPPED') { 
              statusCounts.skipped++; 
              categoryData.skippedCount++; 
              moduleData.skippedCount++; 
            } else { 
              statusCounts.open++; 
              categoryData.openCount++; 
              moduleData.openCount++; 
            }
            
            categoryData.testcases.push({
              id: tc.$.id,
              title: tc.Title || '',
              description: tc.Description || '',
              purpose: tc.Purpose || '',
              profiles: profiles,
              profilesText: profiles.length > 0 ? profiles.join(', ') : '-',
              status: status,
              statusText: statusText,
              isPassed: status === 'PASSED',
              isFailed: status === 'FAILED',
              isSkipped: status === 'SKIPPED',
              isOpen: status === 'OPEN'
            });
          } catch (parseError) {
            console.warn(`Warning: Could not parse ${filePath}`);
          }
        }
        
        if (categoryData.testcases.length > 0) {
          categoryData.testcases.sort((a, b) => a.id.localeCompare(b.id));
          moduleData.categories.push(categoryData);
        }
      }
      
      if (moduleData.categories.length > 0) {
        moduleData.categories.sort((a, b) => a.name.localeCompare(b.name));
        modules.push(moduleData);
      }
    }
    
    modules.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error collecting testcases:', error);
  }
  
  const progress = totalTestcases > 0 
    ? Math.round((statusCounts.passed + statusCounts.skipped) / totalTestcases * 100) 
    : 0;
  
  return {
    modules,
    statistics: {
      total: totalTestcases,
      passed: statusCounts.passed,
      failed: statusCounts.failed,
      skipped: statusCounts.skipped,
      open: statusCounts.open,
      progress: progress
    }
  };
}

/**
 * Calculate derived profiles from checklist selections
 * @param {Object} profilesData - Profile configuration data
 * @returns {Array} Active profile names
 */
function calculateDerivedProfiles(profilesData) {
  const activeProfiles = new Set();
  
  if (!profilesData || !profilesData.sections) {
    return [];
  }
  
  for (const section of profilesData.sections) {
    // Support both 'questions' (new) and 'items' (legacy) field names
    const questions = section.questions || section.items || [];
    
    for (const question of questions) {
      // New format: answer.answered and profileMappings
      if (question.answer && question.profileMappings) {
        if (question.answer.answered) {
          const values = question.answer.values || [];
          
          for (const mapping of question.profileMappings) {
            let matches = false;
            
            if (question.type === 'boolean') {
              const boolValue = values[0]?.toLowerCase() === 'true';
              matches = (mapping.condition === 'true' && boolValue) ||
                       (mapping.condition === 'false' && !boolValue);
            } else if (question.type === 'choice' || question.type === 'multi-choice') {
              matches = values.includes(mapping.condition);
            }
            
            if (matches && mapping.profiles) {
              for (const profile of mapping.profiles) {
                activeProfiles.add(profile);
              }
            }
          }
        }
      }
      // Legacy format: value and profiles array
      else if (question.value && question.profiles) {
        for (const profile of question.profiles) {
          activeProfiles.add(profile);
        }
      }
    }
  }
  
  return Array.from(activeProfiles).sort();
}

module.exports = {
  parseTestcaseId,
  variantToNumber,
  numberToVariant,
  groupTestcasesWithVariants,
  collectAllTestcases,
  collectDetailedTestcases,
  calculateDerivedProfiles
};
