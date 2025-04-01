document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const tablesContainer = document.getElementById('tables-container');
    const addTableBtn = document.getElementById('add-table-btn');
    const fdsListContainer = document.getElementById('fds-list');
    const addFdBtn = document.getElementById('add-fd-btn');
    const normalizeBtn = document.getElementById('normalize-btn');
    const resultsDiv = document.getElementById('results');

    // --- Templates ---
    const tableTemplate = document.getElementById('table-template');
    const columnTemplate = document.getElementById('column-template');
    const fdTemplate = document.getElementById('fd-template');

    // --- Utility Functions (Set operations, formatting - same as before) ---
    const setUnion = (setA, setB) => new Set([...setA, ...setB]);
    const setIntersection = (setA, setB) => new Set([...setA].filter(x => setB.has(x)));
    const setDifference = (setA, setB) => new Set([...setA].filter(x => !setB.has(x)));
    const setIsSubset = (subset, superset) => [...subset].every(x => superset.has(x));
    const setIsProperSubset = (subset, superset) => setIsSubset(subset, superset) && subset.size < superset.size;
    const setsAreEqual = (setA, setB) => setA.size === setB.size && setIsSubset(setA, setB);
    const formatSet = (s) => `{${[...s].sort().join(', ')}}`;

    // --- Core Logic Functions (Parsing, Closure, Keys, Normalization - largely same as before) ---

    /**
     * Parses a comma-separated string of attributes into a Set. Handles potential extra spaces.
     * @param {string} str - The input string.
     * @returns {Set<string>} - A set of attributes.
     */
    function parseAttributes(str) {
        if (!str) return new Set();
        return new Set(str.split(',')
                          .map(a => a.trim()) // Trim whitespace
                          .filter(a => a !== '')); // Remove empty strings
    }

    /**
     * Parses functional dependencies from the structured input fields.
     * @returns {{fds: Array<{determinant: Set<string>, dependent: Set<string>}>, error: string|null}}
     */
    function parseFDsFromUI() {
        const fds = [];
        const fdEntries = fdsListContainer.querySelectorAll('.fd-entry');
        let entryIndex = 0;
        for (const entry of fdEntries) {
            entryIndex++;
            const determinantInput = entry.querySelector('.fd-determinant');
            const dependentInput = entry.querySelector('.fd-dependent');

            const determinantStr = determinantInput.value.trim();
            const dependentStr = dependentInput.value.trim();

            if (!determinantStr && !dependentStr) continue; // Skip empty entries silently

            if (!determinantStr) {
                return { fds: [], error: `FD #${entryIndex}: Determinant (left side) cannot be empty.` };
            }
             if (!dependentStr) {
                return { fds: [], error: `FD #${entryIndex}: Dependent (right side) cannot be empty.` };
            }

            const determinant = parseAttributes(determinantStr);
            const dependent = parseAttributes(dependentStr);

             if (determinant.size === 0) {
                 return { fds: [], error: `FD #${entryIndex}: Could not parse attributes on determinant side.` };
            }
             if (dependent.size === 0) {
                return { fds: [], error: `FD #${entryIndex}: Could not parse attributes on dependent side.` };
            }


            // Handle trivial dependencies (remove attributes from dependent if they are in determinant)
            const common = setIntersection(determinant, dependent);
            let finalDependent = setDifference(dependent, common);

            // Only add the FD if the dependent side is not empty after removing trivial parts
            if (finalDependent.size > 0) {
                 fds.push({ determinant, dependent: finalDependent });
            } else if (dependent.size > 0) {
                // It was completely trivial, maybe warn user? For now, just skip adding it.
                console.warn(`FD #${entryIndex} (${determinantStr} -> ${dependentStr}) is trivial and was skipped.`);
            }
        }
        return { fds, error: null };
    }

    // --- Attribute Closure, Find Candidate Key, Is Superkey (Identical to previous version) ---
        function attributeClosure(initialAttributes, fds, allAttributesInRelation = null) {
        let closure = new Set(initialAttributes);
        let changed = true;

        while (changed) {
            changed = false;
            for (const fd of fds) {
                if (setIsSubset(fd.determinant, closure)) {
                    const dependentsToAdd = allAttributesInRelation
                        ? setIntersection(fd.dependent, allAttributesInRelation)
                        : fd.dependent;

                    const closureSizeBefore = closure.size;
                    closure = setUnion(closure, dependentsToAdd);
                    if (closure.size > closureSizeBefore) {
                        changed = true;
                    }
                }
            }
        }
        return closure;
    }

    function findCandidateKey(relationAttributes, fds) {
        if (relationAttributes.size === 0) return null;

        let potentialKey = new Set(relationAttributes);

        // Iteratively remove attributes
        const attributesToRemove = [...relationAttributes]; // Create array to iterate safely
        for (const attr of attributesToRemove) {
            const smallerKey = setDifference(potentialKey, new Set([attr]));
            if (smallerKey.size === 0) continue; // Don't make key empty

            const closure = attributeClosure(smallerKey, fds, relationAttributes);
            if (setsAreEqual(closure, relationAttributes)) {
                potentialKey = smallerKey; // Successfully removed attribute, key is smaller
            }
        }

        // Final check if the resulting key works
        if (setsAreEqual(attributeClosure(potentialKey, fds, relationAttributes), relationAttributes)) {
            return potentialKey;
        }

        // Fallback: If FDs don't cover all attributes, the full set might be the only key
        if(setsAreEqual(attributeClosure(relationAttributes, fds, relationAttributes), relationAttributes)){
            console.warn("Could not reduce key from all attributes. Returning all attributes as potential key.");
            return relationAttributes;
        }

        console.error("Could not determine a candidate key for:", formatSet(relationAttributes));
        return null; // Indicate failure
    }

     function isSuperkey(keyAttributes, relationAttributes, fds) {
         if (!keyAttributes || keyAttributes.size === 0 || !relationAttributes || relationAttributes.size === 0) return false;
         const closure = attributeClosure(keyAttributes, fds, relationAttributes);
         return setsAreEqual(closure, relationAttributes);
     }

    // --- Normalization Steps (1NF, 2NF, 3NF, BCNF - Identical logic to previous version) ---
    // Important: These functions take `allAttributes` (a Set) and `fds` (Array of {determinant, dependent})
    // They don't care *how* these were collected from the UI.
    function normalize(allAttributes, fds) {
        let output = "";
        let currentRelations = [{ name: "R_initial", attributes: new Set(allAttributes) }];

        // Guard against empty input
        if (allAttributes.size === 0) {
            return "<p class='error'>No attributes defined. Cannot normalize.</p>";
        }
         if (fds.length === 0) {
             output += `<p class='relation-title'>Initial Relation: R_initial(${formatSet(allAttributes)})</p>\n`;
             output += "<p>No functional dependencies provided.</p>";
             output += "<p class='step-explanation'>Without FDs, we cannot determine keys or dependencies. The relation is trivially in BCNF, assuming it meets 1NF (atomic attributes).</p>";
             output += `<p class='success'>Final Relation (assumed BCNF): R_initial(${formatSet(allAttributes)})</p>\n`;
             return output;
         }


        output += `<p class='relation-title'>Initial Universal Relation: U(${formatSet(allAttributes)})</p>\n`;
        output += `Functional Dependencies (F):\n`;
        fds.forEach(fd => {
            output += `  <code>${formatSet(fd.determinant)} → ${formatSet(fd.dependent)}</code>\n`;
        });
        output += "\n---\n";

        // --- 1NF ---
        output += "<h2>Step 1: First Normal Form (1NF)</h2>\n";
        output += "<p class='step-explanation'>Ensures atomic attributes and no repeating groups. We assume your input represents atomic attributes.</p>";
        output += `<p class='success'>Relation U(${formatSet(allAttributes)}) is assumed to be in 1NF.</p>\n\n`;
        output += "---\n";


        // --- 2NF ---
        output += "<h2>Step 2: Second Normal Form (2NF)</h2>\n";
        output += "<p class='step-explanation'>Requires 1NF and no partial dependencies (non-prime attributes depending on only part of a candidate key). Uses *one* candidate key for analysis.</p>";

        let relations2NF = [];
        let decomposedIn2NF = false;
        let relationsToProcess2NF = [...currentRelations];
        let tableCounter2NF = 1;

        while(relationsToProcess2NF.length > 0) {
            const currentRel = relationsToProcess2NF.shift();
            output += `\n<p class='relation-title'>Checking Relation: ${currentRel.name}(${formatSet(currentRel.attributes)})</p>`;

            if (currentRel.attributes.size <= 1) {
                output += `<p>Relation has ≤ 1 attribute. Already in 2NF.</p>`;
                relations2NF.push(currentRel);
                continue;
            }

            const candidateKey = findCandidateKey(currentRel.attributes, fds);
            if (!candidateKey || candidateKey.size === 0) {
                output += `<p class='error'>Cannot determine Candidate Key for ${currentRel.name}. Skipping 2NF check for this relation.</p>`;
                relations2NF.push(currentRel); // Keep original
                continue;
            }
            output += `<p>Candidate Key found: ${formatSet(candidateKey)}</p>`;

             if (candidateKey.size === 1 || candidateKey.size === currentRel.attributes.size) {
                 output += `<p class='success'>No partial dependencies possible (key is simple or covers all attributes). Relation is in 2NF.</p>`;
                 relations2NF.push(currentRel);
                 continue;
            }

            const primeAttributes = new Set(candidateKey);
            const nonPrimeAttributes = setDifference(currentRel.attributes, primeAttributes);
             output += `<p>Prime Attributes: ${formatSet(primeAttributes)}</p>`;
             output += `<p>Non-Prime Attributes: ${formatSet(nonPrimeAttributes)}</p>`;
             if (nonPrimeAttributes.size === 0) {
                 output += `<p class='success'>No non-prime attributes. Relation is in 2NF.</p>`;
                 relations2NF.push(currentRel);
                 continue;
             }


            let partialDependenciesFound = [];
            let attributesInOriginal = new Set(currentRel.attributes); // Start with all attributes
            let attributesToRemove = new Set(); // Non-prime attributes that move to new tables


             // Identify partial dependencies
            for (const fd of fds) {
                const determinant = fd.determinant;
                 // Check if determinant is a PROPER subset of the candidate key
                 if (setIsProperSubset(determinant, candidateKey)) {
                    // Find dependent attributes that are non-prime AND part of this relation
                    let relevantNonPrimeDependents = setIntersection(fd.dependent, nonPrimeAttributes);
                    relevantNonPrimeDependents = setIntersection(relevantNonPrimeDependents, currentRel.attributes); // Make sure they exist here

                     if (relevantNonPrimeDependents.size > 0) {
                         // Check if this determinant is *also* a subset of the current relation's attributes
                         if(setIsSubset(determinant, currentRel.attributes)) {
                            output += `<p>Potential Partial Dependency: <code>${formatSet(determinant)} → ${formatSet(relevantNonPrimeDependents)}</code> (Determinant is part of key, dependent is non-prime)</p>`;
                            partialDependenciesFound.push({ determinant, dependent: relevantNonPrimeDependents });
                            relevantNonPrimeDependents.forEach(attr => attributesToRemove.add(attr));
                            decomposedIn2NF = true;
                         }
                     }
                 }
             }

            if (partialDependenciesFound.length > 0) {
                 output += `<p class='success'>Decomposing ${currentRel.name} due to partial dependencies:</p>`;

                // Create new relations for each unique partial dependency determinant
                const determinantsProcessed = new Set();
                partialDependenciesFound.forEach(pd => {
                     const detKey = [...pd.determinant].sort().join(','); // Key for tracking processed determinants
                     if (!determinantsProcessed.has(detKey)) {
                        const newTableAttrs = new Set(pd.determinant);
                        // Collect *all* non-prime dependents for this determinant from all identified partial FDs
                        partialDependenciesFound.forEach(otherPd => {
                            if (setsAreEqual(pd.determinant, otherPd.determinant)) {
                                otherPd.dependent.forEach(dep => newTableAttrs.add(dep));
                            }
                        });

                        const newTableName = `R${tableCounter2NF++}_2NF`;
                        relations2NF.push({ name: newTableName, attributes: newTableAttrs });
                        output += `<p>  - New Relation: ${newTableName}(${formatSet(newTableAttrs)})</p>`;
                        determinantsProcessed.add(detKey);
                     }
                 });


                 // Create the remaining relation (original attributes minus the moved non-primes)
                 const remainingAttributes = setDifference(attributesInOriginal, attributesToRemove);
                 // Ensure the original candidate key is fully present in the remaining part for lossless join
                 // If parts of the key were non-prime (which shouldn't happen if key finding is right),
                 // or if the only non-primes removed were key parts (error state), adding key back is safe.
                 candidateKey.forEach(k => remainingAttributes.add(k));


                 // Add the remaining relation if it's distinct and meaningful
                 if (remainingAttributes.size > 0 && !setsAreEqual(remainingAttributes, currentRel.attributes)) {
                    let foundExisting = relations2NF.some(r => setsAreEqual(r.attributes, remainingAttributes));
                    if (!foundExisting) {
                        const remainingTableName = `${currentRel.name}_Rem`;
                        relations2NF.push({ name: remainingTableName, attributes: remainingAttributes });
                        output += `<p>  - Remaining Relation: ${remainingTableName}(${formatSet(remainingAttributes)})</p>`;
                    }
                 } else if (remainingAttributes.size === currentRel.attributes.size) {
                    // This means nothing was actually removed, maybe due to how FDs interacted
                     output += `<p class='error'>Internal Check: No attributes removed for 2NF decomposition of ${currentRel.name}. Keeping original.</p>`;
                     relations2NF.push(currentRel); // Add original back
                 } else {
                      output += `<p>  - Original relation ${currentRel.name} potentially fully decomposed.</p>`;
                 }


             } else {
                 output += `<p class='success'>No partial dependencies found. Relation ${currentRel.name} is already in 2NF.</p>`;
                 relations2NF.push(currentRel); // Keep the original relation
             }
        } // End while relationsToProcess2NF

        if (!decomposedIn2NF) {
            output += `<p class='success'>All relations were already in 2NF.</p>\n`;
        } else {
             output += `<p class='success'>Decomposition for 2NF complete.</p>\n`;
        }
        currentRelations = relations2NF;
        output += "\nResulting Relations after 2NF:\n";
        if (currentRelations.length === 0) output += "  (None - check decomposition steps)\n";
        currentRelations.forEach(r => output += `  - ${r.name}(${formatSet(r.attributes)})\n`);
        output += "\n---\n";


        // --- 3NF ---
        output += "<h2>Step 3: Third Normal Form (3NF)</h2>\n";
        output += "<p class='step-explanation'>Requires 2NF and no transitive dependencies (non-prime attributes depending on other non-prime attributes). An FD X → A violates 3NF if X is not a superkey and A is not prime.</p>";

        let relations3NF = [];
        let decomposedIn3NF = false;
        let relationsToProcess3NF = [...currentRelations];
        let tableCounter3NF = 1;
        currentRelations = []; // Reset

         while (relationsToProcess3NF.length > 0) {
            const currentRel = relationsToProcess3NF.shift();
             output += `\n<p class='relation-title'>Checking Relation: ${currentRel.name}(${formatSet(currentRel.attributes)})</p>`;

             if (currentRel.attributes.size <= 2) {
                 output += `<p>Relation has ≤ 2 attributes. Already in 3NF.</p>`;
                 relations3NF.push(currentRel);
                 continue;
             }

            const candidateKey = findCandidateKey(currentRel.attributes, fds);
             if (!candidateKey || candidateKey.size === 0) {
                 output += `<p class='error'>Cannot determine Candidate Key for ${currentRel.name}. Skipping 3NF check.</p>`;
                 relations3NF.push(currentRel);
                 continue;
             }
             output += `<p>Using Candidate Key: ${formatSet(candidateKey)}</p>`;
             // Simplification: Prime attributes are just those in *this* candidate key. Full 3NF needs all candidate keys.
             const primeAttributes = new Set(candidateKey);
             const nonPrimeAttributes = setDifference(currentRel.attributes, primeAttributes);
             output += `<p>Prime Attributes (for this key): ${formatSet(primeAttributes)}</p>`;
             output += `<p>Non-Prime Attributes: ${formatSet(nonPrimeAttributes)}</p>`;
              if (nonPrimeAttributes.size === 0) {
                 output += `<p class='success'>No non-prime attributes. Relation is in 3NF.</p>`;
                 relations3NF.push(currentRel);
                 continue;
             }

            let transitiveDependenciesFound = []; // Store {determinant, dependentAttr} violating 3NF
            let attributesToRemove = new Set(); // Non-prime attributes moved due to transitive dependency

            for (const fd of fds) {
                const determinant = fd.determinant;

                // Ensure FD is relevant (determinant and *some* dependent are within the relation)
                if (setIsSubset(determinant, currentRel.attributes)) {
                    const relevantDependents = setIntersection(fd.dependent, currentRel.attributes);

                    if (relevantDependents.size > 0) {
                        // Check condition for each dependent attribute A individually
                        for (const attrA of relevantDependents) {
                             // Ensure A is not part of the determinant (non-trivial part of FD)
                            if (!determinant.has(attrA)) {
                                const singletonA = new Set([attrA]);

                                // Check 3NF violation conditions:
                                // 1. X is NOT a superkey of the relation
                                const isXSuperkey = isSuperkey(determinant, currentRel.attributes, fds);
                                // 2. A is NOT a prime attribute
                                const isAPrime = primeAttributes.has(attrA);

                                if (!isXSuperkey && !isAPrime) {
                                    output += `<p>Transitive Dependency: <code>${formatSet(determinant)} → ${formatSet(singletonA)}</code> violates 3NF in ${currentRel.name} (X not superkey, A not prime).</p>`;
                                    transitiveDependenciesFound.push({ determinant, dependent: singletonA });
                                    attributesToRemove.add(attrA);
                                    decomposedIn3NF = true;
                                }
                            }
                        }
                    }
                }
            } // End FD check loop


            if (transitiveDependenciesFound.length > 0) {
                output += `<p class='success'>Decomposing ${currentRel.name} due to transitive dependencies:</p>`;

                 // Create new relations: one for each violating FD (X -> A becomes relation R(X, A))
                 const determinantsProcessed = new Set();
                 transitiveDependenciesFound.forEach(td => {
                    const newTableAttrs = setUnion(td.determinant, td.dependent);
                    const tableKey = [...newTableAttrs].sort().join(','); // Key for uniqueness check

                    // Avoid creating duplicate tables if multiple FDs lead to the same schema
                    let foundExisting = relations3NF.some(r => setsAreEqual(r.attributes, newTableAttrs));
                    if (!foundExisting && !determinantsProcessed.has(tableKey)) {
                        const newTableName = `R${tableCounter3NF++}_3NF`;
                        relations3NF.push({ name: newTableName, attributes: newTableAttrs });
                        output += `<p>  - New Relation: ${newTableName}(${formatSet(newTableAttrs)})</p>`;
                        determinantsProcessed.add(tableKey);
                    }
                 });

                // Create the remaining relation: Original attributes MINUS the transitively dependent non-primes (attributesToRemove)
                const remainingAttributes = setDifference(currentRel.attributes, attributesToRemove);
                // Ensure the key is still fully contained (it should be, as key parts or superkeys weren't removed)
                // candidateKey.forEach(k => remainingAttributes.add(k)); // Usually redundant but safe


                 // Add the remaining relation if it's meaningful and not duplicated
                if (remainingAttributes.size > 0 && !setsAreEqual(remainingAttributes, currentRel.attributes)) {
                     let foundExisting = relations3NF.some(r => setsAreEqual(r.attributes, remainingAttributes));
                    if (!foundExisting) {
                        const remainingTableName = `${currentRel.name}_Rem`;
                        relations3NF.push({ name: remainingTableName, attributes: remainingAttributes });
                        output += `<p>  - Remaining Relation: ${remainingTableName}(${formatSet(remainingAttributes)})</p>`;
                    }
                } else if (setsAreEqual(remainingAttributes, currentRel.attributes)){
                     output += `<p class='error'>Internal Check: No attributes removed for 3NF decomposition of ${currentRel.name}. Keeping original.</p>`;
                     relations3NF.push(currentRel); // Add original back
                } else {
                     output += `<p>  - Original relation ${currentRel.name} potentially fully decomposed.</p>`;
                }

            } else {
                output += `<p class='success'>No transitive dependencies found. Relation ${currentRel.name} is already in 3NF.</p>`;
                relations3NF.push(currentRel); // Keep the original
            }
        } // End while relationsToProcess3NF


        if (!decomposedIn3NF) {
            output += `<p class='success'>All relations were already in 3NF.</p>\n`;
        } else {
             output += `<p class='success'>Decomposition for 3NF complete.</p>\n`;
        }
        currentRelations = relations3NF;
        output += "\nResulting Relations after 3NF:\n";
         if (currentRelations.length === 0) output += "  (None - check decomposition steps)\n";
        currentRelations.forEach(r => output += `  - ${r.name}(${formatSet(r.attributes)})\n`);
        output += "\n---\n";


        // --- BCNF ---
        output += "<h2>Step 4: Boyce-Codd Normal Form (BCNF)</h2>\n";
        output += "<p class='step-explanation'>Requires 3NF. For every non-trivial FD X → Y that holds, X must be a superkey. BCNF is stricter and decomposition might lose dependencies.</p>";

        let relationsBCNF_final = []; // Store relations confirmed to be in BCNF
        let decompositionOccurred = false; // Track if any BCNF decomp happened at all
        let relationsToProcessBCNF = [...currentRelations]; // Start with 3NF results
        let tableCounterBCNF = 1;


        // Use a queue-like approach: check each relation, if violates, decompose and add new ones back to check
        let processingQueue = [...relationsToProcessBCNF];

        while (processingQueue.length > 0) {
             const currentRel = processingQueue.shift();
             output += `\n<p class='relation-title'>Checking Relation: ${currentRel.name}(${formatSet(currentRel.attributes)})</p>`;

             let violationFound = false;
             let violatingFD = null; // { determinant: Set, dependent: Set }

             // Check all original FDs against the current relation
             for (const fd of fds) {
                 const determinant = fd.determinant;
                 const dependent = fd.dependent;

                 // Is the FD applicable to this relation? (Determinant and Dependent are subsets)
                 if (setIsSubset(determinant, currentRel.attributes) && setIsSubset(dependent, currentRel.attributes)) {
                      // Is the FD non-trivial *within this relation*? (Dependent has attributes not in Determinant)
                     const relevantDependent = setDifference(dependent, determinant);
                     const relevantDependentInRelation = setIntersection(relevantDependent, currentRel.attributes);

                     if (relevantDependentInRelation.size > 0) {
                         // Check BCNF condition: Is the determinant a superkey of *this* relation?
                         const isXSuperkey = isSuperkey(determinant, currentRel.attributes, fds);

                         if (!isXSuperkey) {
                             output += `<p>BCNF Violation: <code>${formatSet(determinant)} → ${formatSet(relevantDependentInRelation)}</code> holds in ${currentRel.name}, but ${formatSet(determinant)} is not a superkey.</p>`;
                             violationFound = true;
                             violatingFD = { determinant, dependent: relevantDependentInRelation }; // Use the relevant dependent part
                             decompositionOccurred = true;
                             break; // Found a violation, decompose based on this one
                         }
                     }
                 }
             } // End loop checking FDs for currentRel


             if (violationFound) {
                 output += `<p class='success'>Decomposing ${currentRel.name} based on the violation:</p>`;

                 // Decompose R into R1(X U Y) and R2(X U (R - (X U Y)))
                 // R1 = Determinant U RelevantDependent
                 const attrsR1 = setUnion(violatingFD.determinant, violatingFD.dependent);
                 // R2 = Determinant U (Attributes of R minus Attributes of R1)
                 const attrsR2 = setUnion(violatingFD.determinant, setDifference(currentRel.attributes, attrsR1));

                 // Add the new relations back to the queue for checking
                 const nameR1 = `R${tableCounterBCNF++}_BCNF`;
                 const relationR1 = { name: nameR1, attributes: attrsR1 };
                 output += `<p>  - New Relation 1: ${nameR1}(${formatSet(attrsR1)})</p>`;
                 processingQueue.push(relationR1); // Add back to check

                 // Only add R2 if it has attributes and is different from R1
                 if (attrsR2.size > 0 && !setsAreEqual(attrsR1, attrsR2)) {
                    const nameR2 = `R${tableCounterBCNF++}_BCNF`;
                     const relationR2 = { name: nameR2, attributes: attrsR2 };
                     output += `<p>  - New Relation 2: ${nameR2}(${formatSet(attrsR2)})</p>`;
                     processingQueue.push(relationR2); // Add back to check
                 } else {
                     output += `<p>  - Second relation from decomposition was empty or identical, discarded.</p>`;
                 }

             } else {
                  output += `<p class='success'>No BCNF violations found. Relation ${currentRel.name} is in BCNF.</p>`;
                  // This relation is confirmed BCNF, add to final list
                  relationsBCNF_final.push(currentRel);
             }

        } // End while processingQueue


        if (!decompositionOccurred) {
            output += `<p class='success'>All relations were already in BCNF.</p>\n`;
        } else {
             output += `<p class='success'>Decomposition for BCNF complete.</p>\n`;
             output += "<p class='step-explanation'>(Note: Some original functional dependencies might no longer be preserved across these BCNF relations).</p>";

        }
        currentRelations = relationsBCNF_final; // Final result
        output += "\nResulting Relations after BCNF:\n";
        if (currentRelations.length === 0) output += "  (None - check decomposition steps)\n";
        currentRelations.forEach(r => output += `  - ${r.name}(${formatSet(r.attributes)})\n`);
        output += "\n---\n";

        return output;
    } // End of normalize function


    // --- UI Interaction Functions ---

    /** Adds a new, empty table definition block to the UI */
    function addTable() {
        const tableClone = tableTemplate.content.cloneNode(true);
        tablesContainer.appendChild(tableClone);
        // Focus the new table's name input (optional)
        tablesContainer.lastElementChild?.querySelector('.table-name')?.focus();
    }

    /** Adds a column entry to a specific table's column container */
    function addColumn(addColumnButton) {
        const tableDefinition = addColumnButton.closest('.table-definition');
        const input = tableDefinition.querySelector('.new-column-input');
        const columnName = input.value.trim();
        const columnsContainer = tableDefinition.querySelector('.columns-container');

        if (columnName) {
            // Check for duplicates *within this table*
             const existingColumns = columnsContainer.querySelectorAll('.column-name');
             for(let colSpan of existingColumns) {
                 if (colSpan.textContent === columnName) {
                     alert(`Attribute "${columnName}" already exists in this table.`);
                     input.focus();
                     input.select();
                     return; // Don't add duplicate
                 }
             }

            const columnClone = columnTemplate.content.cloneNode(true);
            columnClone.querySelector('.column-name').textContent = columnName;
            columnsContainer.appendChild(columnClone);
            input.value = ''; // Clear input
            input.focus(); // Ready for next column
        } else {
            alert("Please enter an attribute name.");
            input.focus();
        }
    }

     /** Adds a new, empty FD entry row to the UI */
     function addFdRow() {
         const fdClone = fdTemplate.content.cloneNode(true);
         fdsListContainer.appendChild(fdClone);
         // Focus the new determinant input (optional)
         fdsListContainer.lastElementChild?.querySelector('.fd-determinant')?.focus();
     }


    // --- Event Listeners ---

    addTableBtn.addEventListener('click', addTable);
    addFdBtn.addEventListener('click', addFdRow);

    // Use event delegation for dynamically added elements
    tablesContainer.addEventListener('click', (event) => {
        // Handle adding a column
        if (event.target.classList.contains('add-column-btn')) {
            addColumn(event.target);
        }
        // Handle removing a column
        else if (event.target.classList.contains('remove-column-btn')) {
            event.target.closest('.column-entry').remove();
        }
        // Handle removing a table
        else if (event.target.classList.contains('remove-table-btn')) {
            if (confirm("Are you sure you want to remove this entire table and its columns?")) {
                event.target.closest('.table-definition').remove();
            }
        }
    });

    // Use event delegation for removing FDs
     fdsListContainer.addEventListener('click', (event) => {
         if (event.target.classList.contains('remove-fd-btn')) {
              event.target.closest('.fd-entry').remove();
         }
     });

    // Handle Enter key press in "new column" input to add column
    tablesContainer.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && event.target.classList.contains('new-column-input')) {
             event.preventDefault(); // Prevent form submission if inside form
             const addButton = event.target.nextElementSibling; // Find the sibling button
             if(addButton && addButton.classList.contains('add-column-btn')) {
                 addColumn(addButton);
             }
        }
    });


    // Main Normalize Button Handler
    normalizeBtn.addEventListener('click', () => {
        resultsDiv.innerHTML = "<p>Processing...</p>";

        // 1. Collect ALL unique attributes from all tables
        const allAttributes = new Set();
        const columnSpans = tablesContainer.querySelectorAll('.column-name');
        if (columnSpans.length === 0) {
            resultsDiv.innerHTML = "<p class='error'>Schema Error: Please define at least one table with at least one column.</p>";
            return;
        }
        columnSpans.forEach(span => {
            const attrName = span.textContent.trim();
            if (attrName) { // Avoid adding empty strings if somehow created
                allAttributes.add(attrName);
            }
        });

        if (allAttributes.size === 0) {
             resultsDiv.innerHTML = "<p class='error'>Schema Error: No valid attribute names found in the tables.</p>";
            return;
        }

        // 2. Parse Functional Dependencies from the UI
        const { fds, error: fdError } = parseFDsFromUI();

        if (fdError) {
            resultsDiv.innerHTML = `<p class='error'>FD Error: ${fdError}</p>`;
            return;
        }

        // (Optional but recommended) Check if all attributes used in FDs are defined in the tables
         let unknownAttrs = new Set();
         fds.forEach(fd => {
             fd.determinant.forEach(attr => { if (!allAttributes.has(attr)) unknownAttrs.add(attr); });
             fd.dependent.forEach(attr => { if (!allAttributes.has(attr)) unknownAttrs.add(attr); });
         });

         if (unknownAttrs.size > 0) {
              resultsDiv.innerHTML = `<p class='error'>FD Error: The following attributes used in FDs are not defined in any table columns: <code>${formatSet(unknownAttrs)}</code></p>`;
             return;
         }


        // 3. Perform Normalization (using the core logic functions)
        try {
            // Add small delay to allow "Processing..." message to render reliably
            setTimeout(() => {
                const normalizationOutput = normalize(allAttributes, fds);
                resultsDiv.innerHTML = normalizationOutput; // Display results
            }, 50); // 50ms delay

        } catch (e) {
            console.error("Normalization Error:", e);
            resultsDiv.innerHTML = `<p class='error'>An unexpected error occurred during normalization. Check the browser console for details. Error: ${e.message}</p>`;
        }
    });

    // --- Initial State ---
    addTable(); // Start with one empty table definition
    addFdRow(); // Start with one empty FD row

}); // End DOMContentLoaded