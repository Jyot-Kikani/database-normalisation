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

    // --- Utility Functions (Set operations, formatting) ---
    const setUnion = (setA, setB) => new Set([...setA, ...setB]);
    const setIntersection = (setA, setB) => new Set([...setA].filter(x => setB.has(x)));
    const setDifference = (setA, setB) => new Set([...setA].filter(x => !setB.has(x)));
    const setIsSubset = (subset, superset) => [...subset].every(x => superset.has(x));
    const setIsProperSubset = (subset, superset) => setIsSubset(subset, superset) && subset.size < superset.size;
    const setsAreEqual = (setA, setB) => setA.size === setB.size && setIsSubset(setA, setB);
    const formatSet = (s) => `{${[...s].sort().join(', ')}}`;

    // --- Core Logic Functions (Parsing, Closure) ---

    function parseAttributes(str) {
        if (!str) return new Set();
        return new Set(str.split(',')
                          .map(a => a.trim())
                          .filter(a => a !== ''));
    }

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

            if (!determinantStr && !dependentStr) continue;
            if (!determinantStr) return { fds: [], error: `FD #${entryIndex}: Determinant (left side) cannot be empty.` };
            if (!dependentStr) return { fds: [], error: `FD #${entryIndex}: Dependent (right side) cannot be empty.` };

            const determinant = parseAttributes(determinantStr);
            const dependent = parseAttributes(dependentStr);

            if (determinant.size === 0) return { fds: [], error: `FD #${entryIndex}: Could not parse attributes on determinant side.` };
            if (dependent.size === 0) return { fds: [], error: `FD #${entryIndex}: Could not parse attributes on dependent side.` };

            const common = setIntersection(determinant, dependent);
            let finalDependent = setDifference(dependent, common);

            if (finalDependent.size > 0) {
                 fds.push({ determinant, dependent: finalDependent });
            } else if (dependent.size > 0) {
                console.warn(`FD #${entryIndex} (${determinantStr} -> ${dependentStr}) is trivial and was skipped.`);
            }
        }
        return { fds, error: null };
    }

    function attributeClosure(initialAttributes, fds, allAttributesInRelation = null) {
        let closure = new Set(initialAttributes);
        let changed = true;
        const relevantAttributes = allAttributesInRelation ? new Set(allAttributesInRelation) : null; // Use a copy

        while (changed) {
            changed = false;
            for (const fd of fds) {
                // Optimization: check if FD determinant is subset of relation attributes if scope provided
                if (relevantAttributes && !setIsSubset(fd.determinant, relevantAttributes)) {
                    continue;
                }

                if (setIsSubset(fd.determinant, closure)) {
                    let dependentsToAdd = fd.dependent;
                    // Filter dependents if relation scope is provided
                    if (relevantAttributes) {
                        dependentsToAdd = setIntersection(dependentsToAdd, relevantAttributes);
                    }

                    const closureSizeBefore = closure.size;
                    // Only add attributes not already in the closure
                    dependentsToAdd.forEach(dep => {
                        if (!closure.has(dep)) {
                            closure.add(dep);
                            changed = true; // Mark change only if new attribute added
                        }
                    });
                }
            }
        }
        return closure;
    }

    function isSuperkey(keyAttributes, relationAttributes, fds) {
         if (!keyAttributes || keyAttributes.size === 0 || !relationAttributes || relationAttributes.size === 0) return false;
         const closure = attributeClosure(keyAttributes, fds, relationAttributes);
         return setsAreEqual(closure, relationAttributes);
     }

    // --- Function to Find All Candidate Keys ---

    /**
     * Finds all candidate keys for a relation.
     * @param {Set<string>} relationAttributes - The attributes of the relation.
     * @param {Array<{determinant: Set<string>, dependent: Set<string>}>} fds - Functional dependencies.
     * @returns {Array<Set<string>>} - An array of sets, each representing a candidate key. Returns empty array on error or if none found.
     */
     function findAllCandidateKeys(relationAttributes, fds) {
        if (relationAttributes.size === 0) return [];

        const allAttrs = new Set(relationAttributes);
        const superkeys = [];

        // Step 1: Check if the set of all attributes is itself a superkey. If not, something is wrong.
        if (!isSuperkey(allAttrs, allAttrs, fds)) {
             console.error("Error: The set of all attributes is not a superkey. Check FDs.", formatSet(allAttrs));
             // It might mean not all attributes are reachable, or FDs are insufficient.
             // Let's try finding keys anyway, but this is a warning sign.
             // As a fallback, maybe return [allAttrs] if it *does* determine itself?
             if (setIsSubset(allAttrs, attributeClosure(allAttrs, fds, allAttrs))) {
                // It determines itself, proceed with caution
             } else {
                 return []; // Cannot proceed reliably
             }
        }

        // Step 2: Iterate through all possible subsets of attributes (potential keys)
        // This is computationally expensive! (2^n subsets)
        const attributeList = Array.from(allAttrs);
        const numAttributes = attributeList.length;
        let foundSuperkey = false;

        // Optimization: Start checking smaller subsets first
        for (let k = 1; k <= numAttributes; k++) { // k is the size of the subset
             // Generate combinations of size k
             const combinations = getCombinations(attributeList, k);

             for (const combo of combinations) {
                 const potentialKey = new Set(combo);
                 if (isSuperkey(potentialKey, allAttrs, fds)) {
                     superkeys.push(potentialKey);
                     foundSuperkey = true;
                     // Optimization: If we find superkeys of size k, we don't *strictly* need
                     // to check larger sets containing these, but finding all superkeys first
                     // then minimizing is conceptually simpler here.
                 }
             }
             // If we found superkeys of size k, and we are looking for *minimal* keys,
             // we could potentially stop searching larger sizes, but finding all CKs might
             // involve keys of different sizes. Let's find all superkeys first.
        }

         if (!foundSuperkey && isSuperkey(allAttrs, allAttrs, fds)) {
             // If no smaller subset worked, the full set is the only superkey/candidate key
              superkeys.push(allAttrs);
         } else if (!foundSuperkey) {
             console.error("Failed to find any superkey, including the full set of attributes for:", formatSet(allAttrs));
             return []; // Should not happen if initial check passed, but safety.
         }


        // Step 3: Minimize the list of superkeys to find candidate keys
        const candidateKeys = [];
        superkeys.sort((a, b) => a.size - b.size); // Sort by size for easier comparison

        for (const sk of superkeys) {
            let isMinimal = true;
            // Check if any already confirmed candidate key is a proper subset of this superkey
            for (const ck of candidateKeys) {
                if (setIsProperSubset(ck, sk)) {
                    isMinimal = false;
                    break;
                }
            }
            if (isMinimal) {
                 // Also check if sk is a proper subset of any *other* superkey found so far
                 // (This handles cases where we found {A,B} and {A,B,C} as superkeys simultaneously)
                 let isSublistOfOtherSK = false;
                 for(const otherSk of superkeys){
                     if (sk !== otherSk && setIsProperSubset(sk, otherSk)) {
                         // We found a smaller key already ({A,B}) so {A,B,C} isn't minimal if {A,B} works
                         // Wait, this logic is reversed. We want to ensure sk is not a superset of an existing ck.
                         // The first loop already does this.
                     }
                 }

                // Final check: ensure no *other* identified minimal key is a subset.
                // The check against 'candidateKeys' already covers this.
                candidateKeys.push(sk);
            }
        }

        // Ensure candidateKeys only contains unique sets
        const uniqueCandidateKeys = [];
        const seenKeys = new Set();
        for (const ck of candidateKeys) {
            const keyString = [...ck].sort().join(',');
            if (!seenKeys.has(keyString)) {
                uniqueCandidateKeys.push(ck);
                seenKeys.add(keyString);
            }
        }


        return uniqueCandidateKeys;
    }

    /**
    * Helper to generate combinations of k elements from a set/array.
    * @param {Array<string>} elements - The pool of elements.
    * @param {number} k - The size of combinations to generate.
    * @returns {Array<Array<string>>} - An array of combinations.
    */
    function getCombinations(elements, k) {
        if (k < 0 || k > elements.length) {
            return [];
        }
        if (k === 0) {
            return [[]];
        }
        if (k === elements.length) {
            return [elements.slice()];
        }
        if (k === 1) {
            return elements.map(e => [e]);
        }

        const combinations = [];
        const firstElement = elements[0];
        const rest = elements.slice(1);

        // Combinations that include the first element
        const combsWithFirst = getCombinations(rest, k - 1);
        combsWithFirst.forEach(comb => {
            combinations.push([firstElement, ...comb]);
        });

        // Combinations that don't include the first element
        const combsWithoutFirst = getCombinations(rest, k);
        combinations.push(...combsWithoutFirst);

        return combinations;
    }


    // --- Normalization Steps ---

    function normalize(allAttributes, fds) {
        let output = "";
        let currentRelations = [{ name: "U", attributes: new Set(allAttributes) }]; // Start with Universal Relation

        if (allAttributes.size === 0) return "<p class='error'>No attributes defined.</p>";
        if (fds.length === 0) { // No functional dependencies provided
             output += `<p class='relation-title'>Initial Relation: U(${formatSet(allAttributes)})</p>\n`;
             output += "<p>No functional dependencies provided.</p>";
             output += "<p class='step-explanation'>Without FDs, we cannot determine keys or dependencies. The relation is trivially in BCNF, assuming it meets 1NF (atomic attributes).</p>";
             output += `<p class='success'>Final Relation (assumed BCNF): U(${formatSet(allAttributes)})</p>\n`;
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
        output += "<p class='step-explanation'>Requires 1NF and no partial dependencies. A non-prime attribute cannot depend on only a proper subset of *any* candidate key.</p>";

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

            const candidateKeys = findAllCandidateKeys(currentRel.attributes, fds);

            if (candidateKeys.length === 0) {
                output += `<p class='error'>Cannot determine any Candidate Keys for ${currentRel.name}. Skipping 2NF check. Check FDs applicability.</p>`;
                relations2NF.push(currentRel);
                continue;
            }

            output += `<p>Found Candidate Keys: ${candidateKeys.map(ck => `<code>${formatSet(ck)}</code>`).join(', ')}</p>`;

            const allPrimeAttributes = new Set();
            candidateKeys.forEach(ck => ck.forEach(attr => allPrimeAttributes.add(attr)));
            output += `<p>All Prime Attributes: ${formatSet(allPrimeAttributes)}</p>`;

            const nonPrimeAttributes = setDifference(currentRel.attributes, allPrimeAttributes);
            output += `<p>Non-Prime Attributes: ${formatSet(nonPrimeAttributes)}</p>`;

            if (nonPrimeAttributes.size === 0) {
                 output += `<p class='success'>No non-prime attributes. Relation is already in 2NF.</p>`;
                 relations2NF.push(currentRel);
                 continue;
            }
             // Check if all attributes are prime (e.g., single CK covers all)
             if (setsAreEqual(allPrimeAttributes, currentRel.attributes)) {
                 output += `<p class='success'>All attributes are prime. Relation is already in 2NF.</p>`;
                 relations2NF.push(currentRel);
                 continue;
             }


            let partialDependenciesFound = []; // Stores { determinant: Set, dependent: Set, violatingKey: Set }
            let attributesInOriginal = new Set(currentRel.attributes);
            let attributesToRemove = new Set(); // Non-prime attributes that move

            // Check each FD against each Candidate Key
            for (const fd of fds) {
                 const determinant = fd.determinant;
                 // Consider only dependents that are non-prime and in this relation
                 let relevantNonPrimeDependents = setIntersection(fd.dependent, nonPrimeAttributes);
                 relevantNonPrimeDependents = setIntersection(relevantNonPrimeDependents, currentRel.attributes);

                 if (relevantNonPrimeDependents.size > 0 && setIsSubset(determinant, currentRel.attributes)) {
                     // Check if determinant is a proper subset of ANY* candidate key
                     for (const ck of candidateKeys) {
                         if (setIsProperSubset(determinant, ck)) {
                             output += `<p>Potential Partial Dependency: <code>${formatSet(determinant)} → ${formatSet(relevantNonPrimeDependents)}</code> (Determinant is proper subset of CK <code>${formatSet(ck)}</code>, dependent is non-prime).</p>`;
                             // Store the violation details - group by determinant later
                             partialDependenciesFound.push({ determinant: determinant, dependent: relevantNonPrimeDependents, violatingKey: ck });
                             relevantNonPrimeDependents.forEach(attr => attributesToRemove.add(attr));
                             decomposedIn2NF = true;
                             // Found a violation for this FD based on one CK, no need to check other CKs *for this FD*
                             break;
                         }
                     }
                 }
            }


            if (decomposedIn2NF) { // Use the flag set inside the loop
                 output += `<p class='success'>Decomposing ${currentRel.name} due to partial dependencies:</p>`;

                 // Group violations by determinant to create new tables
                 const determinantsToTables = new Map(); // Map<string_key, {determinant: Set, dependents: Set}>
                 partialDependenciesFound.forEach(pd => {
                     const detKey = [...pd.determinant].sort().join(',');
                     if (!determinantsToTables.has(detKey)) {
                         determinantsToTables.set(detKey, { determinant: pd.determinant, dependents: new Set() });
                     }
                     pd.dependent.forEach(dep => determinantsToTables.get(detKey).dependents.add(dep));
                 });

                 // Create new tables
                 determinantsToTables.forEach(tableData => {
                     const newTableAttrs = setUnion(tableData.determinant, tableData.dependents);
                      // Check if already added (e.g., from decomposing another relation)
                      let foundExisting = relations2NF.some(r => setsAreEqual(r.attributes, newTableAttrs));
                     if (!foundExisting) {
                         const newTableName = `R${tableCounter2NF++}_2NF`;
                         relations2NF.push({ name: newTableName, attributes: newTableAttrs });
                         output += `<p>  - New Relation: ${newTableName}(${formatSet(newTableAttrs)})</p>`;
                     }
                 });

                 // Create the remaining relation
                 const remainingAttributes = setDifference(attributesInOriginal, attributesToRemove);
                 // Add back *at least one* full candidate key to ensure lossless join.
                 // If multiple CKs, just adding one is sufficient theory-wise. Add the first one found.
                 if(candidateKeys.length > 0) {
                    candidateKeys[0].forEach(k => remainingAttributes.add(k));
                 }

                  if (remainingAttributes.size > 0) {
                     let foundExisting = relations2NF.some(r => setsAreEqual(r.attributes, remainingAttributes));
                      if (!foundExisting && !setsAreEqual(remainingAttributes, currentRel.attributes)) { // Avoid adding identical or duplicate
                         const remainingTableName = `${currentRel.name}_Rem`;
                         relations2NF.push({ name: remainingTableName, attributes: remainingAttributes });
                         output += `<p>  - Remaining Relation: ${remainingTableName}(${formatSet(remainingAttributes)})</p>`;
                      } else if (setsAreEqual(remainingAttributes, currentRel.attributes)) {
                          output += `<p class='error'>Internal Check: No attributes removed for 2NF decomposition of ${currentRel.name}. Keeping original.</p>`;
                          if (!foundExisting) relations2NF.push(currentRel); // Add original only if not already effectively present
                      }
                  } else {
                      output += `<p>  - Original relation ${currentRel.name} potentially fully decomposed.</p>`;
                 }


             } else {
                 output += `<p class='success'>No partial dependencies found. Relation ${currentRel.name} is already in 2NF.</p>`;
                 relations2NF.push(currentRel); // Keep the original relation
             }
        }

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
        output += "<p class='step-explanation'>Requires 2NF and no transitive dependencies. An FD X → A violates 3NF if X is not a superkey and A is not a prime attribute (i.e., A is not part of *any* candidate key).</p>";

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

            //nFind ALL candidate keys for this relation
            const candidateKeys = findAllCandidateKeys(currentRel.attributes, fds);

            if (candidateKeys.length === 0) {
                output += `<p class='error'>Cannot determine Candidate Keys for ${currentRel.name}. Skipping 3NF check.</p>`;
                relations3NF.push(currentRel);
                continue;
            }
            output += `<p>Found Candidate Keys: ${candidateKeys.map(ck => `<code>${formatSet(ck)}</code>`).join(', ')}</p>`;

            // Determine ALL prime attributes
            const allPrimeAttributes = new Set();
            candidateKeys.forEach(ck => ck.forEach(attr => allPrimeAttributes.add(attr)));
            output += `<p>All Prime Attributes: ${formatSet(allPrimeAttributes)}</p>`;

            const nonPrimeAttributes = setDifference(currentRel.attributes, allPrimeAttributes);
             output += `<p>Non-Prime Attributes: ${formatSet(nonPrimeAttributes)}</p>`;
              if (nonPrimeAttributes.size === 0) {
                 output += `<p class='success'>No non-prime attributes. Relation is already in 3NF.</p>`;
                 relations3NF.push(currentRel);
                 continue;
             }

            let transitiveDependenciesFound = []; // Store {determinant, dependentAttr} violating 3NF
            let attributesToRemove = new Set(); // Non-prime attributes moved due to transitive dependency

            for (const fd of fds) {
                const determinant = fd.determinant;

                if (setIsSubset(determinant, currentRel.attributes)) {
                    const relevantDependents = setIntersection(fd.dependent, currentRel.attributes);

                    if (relevantDependents.size > 0) {
                        // Check violation for each dependent attribute A individually
                        for (const attrA of relevantDependents) {
                            if (!determinant.has(attrA)) { // Ensure non-trivial part
                                const singletonA = new Set([attrA]);

                                // Check:
                                // 1. X is NOT a superkey of the relation
                                const isXSuperkey = isSuperkey(determinant, currentRel.attributes, fds);
                                // 2. A is NOT a prime attribute (using allPrimeAttributes)
                                const isAPrime = allPrimeAttributes.has(attrA);

                                if (!isXSuperkey && !isAPrime) {
                                    output += `<p>Transitive Dependency: <code>${formatSet(determinant)} → ${formatSet(singletonA)}</code> violates 3NF in ${currentRel.name} (X not superkey, A not prime).</p>`;
                                    // Group by determinant for decomposition later
                                     transitiveDependenciesFound.push({ determinant: determinant, dependent: singletonA });
                                    attributesToRemove.add(attrA);
                                    decomposedIn3NF = true;
                                }
                            }
                        }
                    }
                }
            }


            if (decomposedIn3NF) { // Use flag
                output += `<p class='success'>Decomposing ${currentRel.name} due to transitive dependencies:</p>`;

                // Group violations by determinant
                const determinantsToTables = new Map(); // Map<string_key, {determinant: Set, dependents: Set}>
                 transitiveDependenciesFound.forEach(td => {
                     const detKey = [...td.determinant].sort().join(',');
                     if (!determinantsToTables.has(detKey)) {
                         determinantsToTables.set(detKey, { determinant: td.determinant, dependents: new Set() });
                     }
                     // Add the single dependent attribute from td.dependent
                      td.dependent.forEach(dep => determinantsToTables.get(detKey).dependents.add(dep));
                 });

                 // Create new tables R(X, A) for each group
                  determinantsToTables.forEach(tableData => {
                     const newTableAttrs = setUnion(tableData.determinant, tableData.dependents);
                      let foundExisting = relations3NF.some(r => setsAreEqual(r.attributes, newTableAttrs));
                     if (!foundExisting) {
                        const newTableName = `R${tableCounter3NF++}_3NF`;
                        relations3NF.push({ name: newTableName, attributes: newTableAttrs });
                        output += `<p>  - New Relation: ${newTableName}(${formatSet(newTableAttrs)})</p>`;
                     }
                 });


                // Create the remaining relation: Original MINUS removed non-primes
                const remainingAttributes = setDifference(currentRel.attributes, attributesToRemove);
                // Add back a candidate key if it's not fully contained (should usually be contained)
                if(candidateKeys.length > 0 && !setIsSubset(candidateKeys[0], remainingAttributes)) {
                   candidateKeys[0].forEach(k => remainingAttributes.add(k));
                   output += `<p>  - (Ensured key ${formatSet(candidateKeys[0])} is in remaining relation)</p>`
                }


                 if (remainingAttributes.size > 0) {
                     let foundExisting = relations3NF.some(r => setsAreEqual(r.attributes, remainingAttributes));
                     if (!foundExisting && !setsAreEqual(remainingAttributes, currentRel.attributes)) {
                         const remainingTableName = `${currentRel.name}_Rem`;
                         relations3NF.push({ name: remainingTableName, attributes: remainingAttributes });
                         output += `<p>  - Remaining Relation: ${remainingTableName}(${formatSet(remainingAttributes)})</p>`;
                     } else if (setsAreEqual(remainingAttributes, currentRel.attributes)){
                         output += `<p class='error'>Internal Check: No attributes removed for 3NF decomposition of ${currentRel.name}. Keeping original.</p>`;
                          if (!foundExisting) relations3NF.push(currentRel);
                     }
                 } else {
                     output += `<p>  - Original relation ${currentRel.name} potentially fully decomposed.</p>`;
                 }

            } else {
                output += `<p class='success'>No transitive dependencies found. Relation ${currentRel.name} is already in 3NF.</p>`;
                relations3NF.push(currentRel); // Keep the original
            }
        }


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
        output += "<p class='step-explanation'>Requires 3NF. For every non-trivial FD X → Y that holds, X must be a superkey. Decomposition might lose dependencies.</p>";

        let relationsBCNF_final = [];
        let decompositionOccurredBCNF = false; // Renamed flag
        let relationsToProcessBCNF = [...currentRelations];
        let tableCounterBCNF = 1;
        let processingQueue = [...relationsToProcessBCNF];

        while (processingQueue.length > 0) {
             const currentRel = processingQueue.shift();
             output += `\n<p class='relation-title'>Checking Relation: ${currentRel.name}(${formatSet(currentRel.attributes)})</p>`;

             let violationFound = false;
             let violatingFD = null; // { determinant: Set, dependent: Set }

             for (const fd of fds) { // Check against original FDs
                 const determinant = fd.determinant;
                 const dependent = fd.dependent;

                 if (setIsSubset(determinant, currentRel.attributes) && setIsSubset(dependent, currentRel.attributes)) {
                     const relevantDependent = setDifference(dependent, determinant);
                     const relevantDependentInRelation = setIntersection(relevantDependent, currentRel.attributes);

                     if (relevantDependentInRelation.size > 0) {
                         const isXSuperkey = isSuperkey(determinant, currentRel.attributes, fds);

                         if (!isXSuperkey) {
                             output += `<p>BCNF Violation: <code>${formatSet(determinant)} → ${formatSet(relevantDependentInRelation)}</code> holds in ${currentRel.name}, but ${formatSet(determinant)} is not a superkey.</p>`;
                             violationFound = true;
                             violatingFD = { determinant, dependent: relevantDependentInRelation };
                             decompositionOccurredBCNF = true;
                             break; // Decompose based on this violation
                         }
                     }
                 }
             }

             if (violationFound) {
                 output += `<p class='success'>Decomposing ${currentRel.name} based on the violation:</p>`;
                 const attrsR1 = setUnion(violatingFD.determinant, violatingFD.dependent);
                 const attrsR2 = setUnion(violatingFD.determinant, setDifference(currentRel.attributes, attrsR1));

                 const nameR1 = `R${tableCounterBCNF++}_BCNF`;
                 const relationR1 = { name: nameR1, attributes: attrsR1 };
                 output += `<p>  - New Relation 1: ${nameR1}(${formatSet(attrsR1)})</p>`;
                 processingQueue.push(relationR1);

                 if (attrsR2.size > 0 && !setsAreEqual(attrsR1, attrsR2)) {
                    const nameR2 = `R${tableCounterBCNF++}_BCNF`;
                     const relationR2 = { name: nameR2, attributes: attrsR2 };
                     output += `<p>  - New Relation 2: ${nameR2}(${formatSet(attrsR2)})</p>`;
                     processingQueue.push(relationR2);
                 } else {
                    output += `<p>  - Second relation from decomposition was empty or identical, discarded.</p>`;
                 }
             } else {
                  output += `<p class='success'>No BCNF violations found. Relation ${currentRel.name} is in BCNF.</p>`;
                  relationsBCNF_final.push(currentRel);
             }
        }

        if (!decompositionOccurredBCNF) {
            output += `<p class='success'>All relations were already in BCNF.</p>\n`;
        } else {
             output += `<p class='success'>Decomposition for BCNF complete.</p>\n`;
             output += "<p class='step-explanation'>(Note: Some original functional dependencies might no longer be preserved across these BCNF relations).</p>";
        }
        currentRelations = relationsBCNF_final;
        output += "\nResulting Relations after BCNF:\n";
        if (currentRelations.length === 0) output += "  (None - check decomposition steps)\n";
        currentRelations.forEach(r => output += `  - ${r.name}(${formatSet(r.attributes)})\n`);
        output += "\n---\n";

        return output;
    }


    // UI Interaction Functions (addTable, addColumn, addFdRow)
    function addTable() {
        const tableClone = tableTemplate.content.cloneNode(true);
        tablesContainer.appendChild(tableClone);
        tablesContainer.lastElementChild?.querySelector('.table-name')?.focus();
    }
    function addColumn(addColumnButton) {
        const tableDefinition = addColumnButton.closest('.table-definition');
        const input = tableDefinition.querySelector('.new-column-input');
        const columnName = input.value.trim();
        const columnsContainer = tableDefinition.querySelector('.columns-container');
        if (columnName) {
             const existingColumns = columnsContainer.querySelectorAll('.column-name');
             for(let colSpan of existingColumns) {
                 if (colSpan.textContent === columnName) {
                     alert(`Attribute "${columnName}" already exists in this table.`);
                     input.focus(); input.select(); return;
                 }
             }
            const columnClone = columnTemplate.content.cloneNode(true);
            columnClone.querySelector('.column-name').textContent = columnName;
            columnsContainer.appendChild(columnClone);
            input.value = ''; input.focus();
        } else {
            alert("Please enter an attribute name."); input.focus();
        }
    }
     function addFdRow() {
         const fdClone = fdTemplate.content.cloneNode(true);
         fdsListContainer.appendChild(fdClone);
         fdsListContainer.lastElementChild?.querySelector('.fd-determinant')?.focus();
     }


    // --- Event Listeners ---
    addTableBtn.addEventListener('click', addTable);
    addFdBtn.addEventListener('click', addFdRow);
    tablesContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('add-column-btn')) addColumn(event.target);
        else if (event.target.classList.contains('remove-column-btn')) event.target.closest('.column-entry').remove();
        else if (event.target.classList.contains('remove-table-btn')) {
            if (confirm("Remove this table?")) event.target.closest('.table-definition').remove();
        }
    });
     fdsListContainer.addEventListener('click', (event) => {
         if (event.target.classList.contains('remove-fd-btn')) event.target.closest('.fd-entry').remove();
     });
    tablesContainer.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && event.target.classList.contains('new-column-input')) {
             event.preventDefault();
             const addButton = event.target.nextElementSibling;
             if(addButton && addButton.classList.contains('add-column-btn')) addColumn(addButton);
        }
    });

    // --- Normalize Button Handler --- 
    normalizeBtn.addEventListener('click', () => {
        resultsDiv.innerHTML = "<p>Processing...</p>";

        // 1. Collect Attributes
        const allAttributes = new Set();
        const columnSpans = tablesContainer.querySelectorAll('.column-name');
        if (columnSpans.length === 0) {
            resultsDiv.innerHTML = "<p class='error'>Schema Error: Please define at least one table with at least one column.</p>";
            return;
        }
        columnSpans.forEach(span => {
            const attrName = span.textContent.trim();
            if (attrName) allAttributes.add(attrName);
        });
         if (allAttributes.size === 0) {
             resultsDiv.innerHTML = "<p class='error'>Schema Error: No valid attribute names found.</p>";
            return;
        }

        // 2. Parse FDs 
        const { fds, error: fdError } = parseFDsFromUI();
        if (fdError) {
            resultsDiv.innerHTML = `<p class='error'>FD Error: ${fdError}</p>`; return;
        }

        // 3. Check FD Attributes Exist 
         let unknownAttrs = new Set();
         fds.forEach(fd => {
             fd.determinant.forEach(attr => { if (!allAttributes.has(attr)) unknownAttrs.add(attr); });
             fd.dependent.forEach(attr => { if (!allAttributes.has(attr)) unknownAttrs.add(attr); });
         });
         if (unknownAttrs.size > 0) {
              resultsDiv.innerHTML = `<p class='error'>FD Error: Attributes used in FDs not defined in tables: <code>${formatSet(unknownAttrs)}</code></p>`;
             return;
         }

        // 4. Perform Normalization
        try {
            setTimeout(() => { // Small delay for UI update
                const normalizationOutput = normalize(allAttributes, fds);
                resultsDiv.innerHTML = normalizationOutput;
            }, 50);
        } catch (e) {
            console.error("Normalization Error:", e);
            resultsDiv.innerHTML = `<p class='error'>An unexpected error occurred: ${e.message}. Check console.</p>`;
        }
    });

    // --- Initial State --- 
    addTable();
    addFdRow();

});