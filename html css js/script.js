document.addEventListener("DOMContentLoaded", () => {

    // Production webhook
    const API_WEBHOOK = "https://n8n.srv1325858.hstgr.cloud/webhook/infos_patient";

    // Global helper to sync native selects with the custom dropdown UI
    window.updateCustomSelectVisual = function (select) {
        if (!select) return;
        const wrapper = select.parentElement;
        if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
            const customSelect = wrapper.querySelector('.custom-select span');
            const customOptions = wrapper.querySelectorAll('.custom-option');
            if (customSelect) {
                const selectedOption = select.options[select.selectedIndex];
                customSelect.textContent = selectedOption ? selectedOption.text : "Select...";
                // Clear error visually if any exists
                wrapper.querySelector('.custom-select').classList.remove('error-input');
                customSelect.style.color = (selectedOption && selectedOption.value === "") ? "#94a3b8" : "var(--text-color)";
            }
            if (customOptions) {
                customOptions.forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.textContent === (select.options[select.selectedIndex]?.text)) {
                        opt.classList.add('selected');
                    }
                });
            }
        }
    };

    /* --- Form Wizard Logic --- */
    const waves = document.querySelectorAll(".wave");
    const nextBtns = document.querySelectorAll(".next-btn");
    const prevBtns = document.querySelectorAll(".prev-btn");
    const progressBar = document.getElementById("progress-bar");
    const currentStepIndicator = document.getElementById("current-step");
    const totalStepsIndicator = document.getElementById("total-steps");

    let currentStep = 0;
    const totalSteps = waves.length;
    // ensure HTML uses actual wave count dynamically:
    if (totalStepsIndicator) totalStepsIndicator.textContent = totalSteps;

    function updateWizard() {
        waves.forEach((wave, index) => {
            wave.classList.toggle("active", index === currentStep);
        });
        const progressPercent = ((currentStep + 1) / totalSteps) * 100;
        if (progressBar) progressBar.style.width = progressPercent + "%";
        if (currentStepIndicator) currentStepIndicator.textContent = currentStep + 1;

        // Resize canvas properly for all signature pads on current wave
        // Small timeout allows DOM to un-hide elements so offsetWidth is > 0
        setTimeout(() => resizeCanvas(), 50);
    }

    // Input Validation before moving next
    function validateCurrentWave() {
        const currentWave = waves[currentStep];
        // Check all inputs, selects, and textareas for constraints like pattern, type, or required
        const allInputs = currentWave.querySelectorAll("input, select, textarea");
        let isValid = true;
        let reported = false;

        allInputs.forEach(input => {
            if (input.type === "radio" || input.type === "checkbox") {
                if (input.required) {
                    const groupName = input.name;
                    const groupChecked = currentWave.querySelector(`input[name="${groupName}"]:checked`);
                    if (!groupChecked) {
                        isValid = false;
                        input.closest('label')?.classList.add("error-input");
                        setTimeout(() => input.closest('label')?.classList.remove("error-input"), 400);
                    }
                }
            } else {
                // Check native HTML5 validity (patterns, email types, required emptiness)
                if (!input.checkValidity() || (input.required && !input.value.trim())) {
                    isValid = false;
                    input.classList.add("error-input");

                    if (input.tagName === 'SELECT') {
                        const customUI = input.parentElement.querySelector('.custom-select');
                        if (customUI) customUI.classList.add('error-input');
                    }

                    if (!reported) {
                        input.reportValidity(); // Show native browser tooltip!
                        reported = true;
                    }

                    const removeError = function () {
                        if (input.checkValidity() && (!input.required || input.value.trim())) {
                            input.classList.remove("error-input");
                            if (input.tagName === 'SELECT') {
                                const customUI = input.parentElement.querySelector('.custom-select');
                                if (customUI) customUI.classList.remove('error-input');
                            }
                            input.removeEventListener("input", removeError);
                            input.removeEventListener("change", removeError);
                        }
                    };
                    input.addEventListener("input", removeError);
                    input.addEventListener("change", removeError);
                }
            }
        });

        // Specific to signature wave (wave 14, index 13)
        if (currentStep === totalSteps - 1) {
            const ageInputFinal = document.querySelector('input[name="PATIENT_AGE"]');
            const isMinor = ageInputFinal && parseInt(ageInputFinal.value, 10) < 18;

            if (!isMinor && signatureEmpty) {
                isValid = false;
                canvas.style.borderColor = "var(--error-color)";
                setTimeout(() => canvas.style.borderColor = "var(--border-color)", 2000);
            }
        }

        // Specific to guardian signature wave (wave 3, index 2)
        if (currentStep === 2) {
            const ageInputFinal = document.querySelector('input[name="PATIENT_AGE"]');
            const isMinor = ageInputFinal && parseInt(ageInputFinal.value, 10) < 18;
            if (isMinor && guardianSignatureEmpty && guardianCanvas) {
                isValid = false;
                guardianCanvas.style.borderColor = "var(--error-color)";
                setTimeout(() => guardianCanvas.style.borderColor = "#cbd5e1", 2000); // Standard border is gray dashed
            }
        }

        // Scroll to the first error if validation fails
        if (!isValid) {
            const firstError = currentWave.querySelector('.error-input');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (signatureEmpty && currentStep === totalSteps - 1) {
                canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (guardianSignatureEmpty && currentStep === 2) {
                guardianCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        return isValid;
    }

    nextBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            if (validateCurrentWave()) {
                if (currentStep < totalSteps - 1) {
                    currentStep++;
                    updateWizard();
                    window.scrollTo({ top: 0, behavior: 'smooth' }); // important on mobile
                }
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            if (currentStep > 0) {
                currentStep--;
                updateWizard();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    updateWizard(); // Init

    /* --- Smart Helpers (Age Calculation & Minor Detection) --- */
    const dobInput = document.querySelector('input[name="PATIENT_DOB"]');
    const ageInput = document.querySelector('input[name="PATIENT_AGE"]');
    const patientTypeSelect = document.querySelector('select[name="PATIENT_TYPE"]');
    const guardianPrintNameInput = document.querySelector('input[name="FINAL_GUARDIAN_PRINT_NAME"]');
    const guardianNameInput = document.querySelector('input[name="GUARDIAN_NAME"]');

    if (dobInput && ageInput) {
        dobInput.addEventListener('change', () => {
            if (!dobInput.value) return;
            const dob = new Date(dobInput.value);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const m = today.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            ageInput.value = age;

            // Auto-detect Minor/Adult & Show/Hide Guardian Sections
            const guardianInfoSection = document.getElementById('guardian-info-section');
            const guardianSignatureSection = document.getElementById('guardian-signature-section');
            const gNameInput = document.querySelector('input[name="GUARDIAN_NAME"]');

            if (patientTypeSelect) {
                if (age < 18) {
                    patientTypeSelect.value = "Minor";
                    patientTypeSelect.style.border = "2px solid var(--primary-color)";

                    // Show Guardian Info
                    if (guardianInfoSection) guardianInfoSection.style.display = "block";
                    if (guardianSignatureSection) guardianSignatureSection.style.display = "block";

                    // Enforce constraints
                    guardianPrintNameInput.required = true;
                    if (gNameInput) gNameInput.required = true;
                } else {
                    patientTypeSelect.value = "Adult";
                    patientTypeSelect.style.border = "1px solid var(--border-color)";

                    // Hide Guardian Info completely
                    if (guardianInfoSection) guardianInfoSection.style.display = "none";
                    if (guardianSignatureSection) guardianSignatureSection.style.display = "none";

                    // Remove constraints so hidden inputs don't block submission
                    guardianPrintNameInput.required = false;
                    guardianPrintNameInput.value = ''; // clear value

                    if (gNameInput) {
                        gNameInput.required = false;
                        gNameInput.value = ''; // clear value
                    }

                    const legalRepName = document.querySelector('input[name="FINAL_LEGAL_REP_NAME"]');
                    if (legalRepName) {
                        legalRepName.value = '';
                    }
                }
                window.updateCustomSelectVisual(patientTypeSelect);
            }
        });

        // Trigger on load for draft initialization
        setTimeout(() => {
            if (dobInput.value) {
                dobInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 200);
    }

    /* --- Smart Auto-Fill: Copy Guardian to Emergency Contact --- */
    const copyContactBtn = document.querySelector('.copy-contact-btn');
    if (copyContactBtn) {
        copyContactBtn.addEventListener('click', () => {
            const guardianName = document.querySelector('input[name="GUARDIAN_NAME"]').value;
            const emergencyNameInput = document.querySelector('input[name="EMERGENCY_CONTACT_NAME"]');
            const emergencyRelationSelect = document.querySelector('select[data-name="EMERGENCY_CONTACT_RELATION"]');

            if (guardianName) {
                emergencyNameInput.value = guardianName;

                // Select "Parent" as a logical default when copying a guardian
                if (emergencyRelationSelect) {
                    emergencyRelationSelect.value = "Parent";
                    // Just in case it was set to "Other", hide the other wrapper
                    const otherWrapper = emergencyRelationSelect.parentElement.querySelector('.other-input-wrapper');
                    if (otherWrapper) otherWrapper.classList.remove('show');
                }

                // Add a brief glow effect to show it worked
                emergencyNameInput.style.boxShadow = "0 0 15px var(--success-color)";
                emergencyNameInput.style.borderColor = "var(--success-color)";
                setTimeout(() => {
                    emergencyNameInput.style.boxShadow = "";
                    emergencyNameInput.style.borderColor = "";
                }, 800);
            } else {
                alert("Please fill in the Legal Guardian name first.");
            }
        });
    }

    /* --- Rotating Email Placeholders --- */
    const emailInput = document.getElementById('email-input');
    if (emailInput) {
        const emailExamples = [
            "Ex: jean.dupont@gmail.com",
            "Ex: contact@entreprise.fr",
            "Ex: prof.marie@univ.edu",
            "Ex: hello@domaine.com"
        ];
        let emailPlaceholderIndex = 0;
        setInterval(() => {
            emailPlaceholderIndex = (emailPlaceholderIndex + 1) % emailExamples.length;
            emailInput.setAttribute('placeholder', emailExamples[emailPlaceholderIndex]);
        }, 3000);
    }

    /* --- Smart Rules Engine (Filtrage Intelligent) --- */
    // Rule 1: Sleep Quality -> Auto-hide details if Sleep is "Good" or "Very Good"
    const sleepRating = document.querySelector('select[name="SLEEPING_HABITS_RATING"]');
    const sleepNotesParent = document.querySelector('textarea[name="SLEEPING_HABITS_NOTES"]')?.parentElement;

    if (sleepRating && sleepNotesParent) {
        // Initial check
        if (sleepRating.value === 'Good' || sleepRating.value === 'Very Good') {
            sleepNotesParent.style.display = 'none';
        }

        sleepRating.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'Good' || val === 'Very Good') {
                sleepNotesParent.style.opacity = '0';
                setTimeout(() => sleepNotesParent.style.display = 'none', 300);
            } else {
                sleepNotesParent.style.display = 'block';
                setTimeout(() => sleepNotesParent.style.opacity = '1', 10);
            }
        });
        // Add CSS transition for smooth hide/show
        sleepNotesParent.style.transition = "opacity 0.3s ease";
    }

    // Rule 2: Gender -> Hide Pregnancy (If it exists in the future, ready for it)
    const genderSelect = document.querySelector('select[data-name="PATIENT_GENDER"]');
    if (genderSelect) {
        genderSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const pregnancyFields = document.querySelectorAll('.pregnancy-related');
            pregnancyFields.forEach(field => {
                if (val === 'Male') {
                    field.style.display = 'none';
                } else {
                    field.style.display = 'block';
                }
            });
        });
    }

    // Rule 3: Employment -> Show details only if employed or student
    const employedSelect = document.querySelector('select[name="EMPLOYED_YN"]');
    const employmentDetailsParent = document.querySelector('select[data-name="EMPLOYMENT_DETAILS"]')?.parentElement;
    if (employedSelect && employmentDetailsParent) {
        employedSelect.addEventListener('change', (e) => {
            if (e.target.value === 'No') {
                employmentDetailsParent.style.opacity = '0';
                setTimeout(() => employmentDetailsParent.style.display = 'none', 300);
            } else {
                employmentDetailsParent.style.display = 'block';
                setTimeout(() => employmentDetailsParent.style.opacity = '1', 10);
            }
        });
        employmentDetailsParent.style.transition = "opacity 0.3s ease";
    }

    /* --- Custom Select Engine (Auto-convert native selects) --- */
    const nativeSelects = document.querySelectorAll('select');
    nativeSelects.forEach(select => {
        // Hide native without breaking validation
        select.style.position = 'absolute';
        select.style.opacity = '0';
        select.style.height = '0';
        select.style.width = '0';
        select.style.pointerEvents = 'none';

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        // Create trigger UI
        const customSelect = document.createElement('div');
        customSelect.className = 'custom-select';

        const selectedText = document.createElement('span');
        selectedText.textContent = select.options[select.selectedIndex]?.text || "Select...";
        if (select.options[select.selectedIndex]?.value === "") {
            selectedText.style.color = "#94a3b8"; // Placeholder color
        }

        const arrow = document.createElement('div');
        arrow.className = 'custom-select-arrow';
        arrow.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';

        customSelect.appendChild(selectedText);
        customSelect.appendChild(arrow);
        wrapper.appendChild(customSelect);

        // Create options container
        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        Array.from(select.options).forEach((option, index) => {
            const customOption = document.createElement('div');
            customOption.className = 'custom-option';
            if (index === select.selectedIndex) customOption.classList.add('selected');
            if (option.value === "") { customOption.style.color = '#94a3b8'; }
            customOption.textContent = option.text;

            customOption.addEventListener('click', (e) => {
                e.stopPropagation();
                select.value = option.value;
                selectedText.textContent = option.text;
                selectedText.style.color = option.value === "" ? "#94a3b8" : "var(--text-color)";

                // Remove selected class from all
                Array.from(optionsList.children).forEach(c => c.classList.remove('selected'));
                customOption.classList.add('selected');
                customSelect.classList.remove('open');

                // Trigger change event to activate Smart Engine logic
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsList.appendChild(customOption);
        });

        wrapper.appendChild(optionsList);

        // Toggle open/close
        customSelect.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all others and reset their wrapper z-index
            document.querySelectorAll('.custom-select.open').forEach(cs => {
                if (cs !== customSelect) {
                    cs.classList.remove('open');
                    if (cs.parentElement) {
                        cs.parentElement.style.zIndex = '1';
                        let p = cs.parentElement.parentElement;
                        while (p && !p.classList.contains('wave') && p.tagName !== 'FORM' && p !== document.body) {
                            p.style.zIndex = '';
                            p = p.parentElement;
                        }
                    }
                }
            });

            customSelect.classList.toggle('open');

            // Manage wrapper z-index to prevent overlap with elements below
            if (customSelect.classList.contains('open')) {
                wrapper.style.zIndex = '9999';
                let p = wrapper.parentElement;
                while (p && !p.classList.contains('wave') && p.tagName !== 'FORM' && p !== document.body) {
                    p.style.zIndex = '9999';
                    p.style.position = 'relative';
                    p = p.parentElement;
                }

                // Auto scroll to prevent clipping
                setTimeout(() => {
                    const rect = optionsList.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight) {
                        window.scrollBy({ top: rect.bottom - window.innerHeight + 20, behavior: 'smooth' });
                    }
                }, 400);
            } else {
                // Delay resetting z-index slightly to let animation finish smoothly
                setTimeout(() => {
                    wrapper.style.zIndex = '1';
                    let p = wrapper.parentElement;
                    while (p && !p.classList.contains('wave') && p.tagName !== 'FORM' && p !== document.body) {
                        p.style.zIndex = '';
                        p.style.position = '';
                        p = p.parentElement;
                    }
                }, 400);
            }
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select.open').forEach(cs => {
            cs.classList.remove('open');
            if (cs.parentElement) {
                setTimeout(() => {
                    cs.parentElement.style.zIndex = '1';
                    let p = cs.parentElement.parentElement;
                    while (p && !p.classList.contains('wave') && p.tagName !== 'FORM' && p !== document.body) {
                        p.style.zIndex = '';
                        p.style.position = '';
                        p = p.parentElement;
                    }
                }, 400);
            }
        });
    });

    /* --- Smart Dropdowns with "Other" option (Updated for Custom Selects) --- */
    document.addEventListener('change', (e) => {
        if (e.target.tagName === 'SELECT' && e.target.classList.contains('has-other')) {
            const selectTarget = e.target;
            const wrapper = selectTarget.parentElement.nextElementSibling;

            if (wrapper && wrapper.classList.contains('other-input-wrapper')) {
                const input = wrapper.querySelector('input');

                if (selectTarget.value === 'Other') {
                    wrapper.style.display = 'block';
                    // Trigger reflow for animation
                    void wrapper.offsetWidth;
                    wrapper.classList.add('show');
                    if (input) {
                        input.setAttribute('required', 'true');
                        input.setAttribute('name', selectTarget.getAttribute('data-name'));
                        selectTarget.removeAttribute('name');
                    }
                } else {
                    wrapper.classList.remove('show');
                    if (input) {
                        input.removeAttribute('required');
                        input.value = ''; // clear when hidden
                        input.removeAttribute('name');
                    }
                    selectTarget.setAttribute('name', selectTarget.getAttribute('data-name'));
                    // Wait for transition before hiding
                    setTimeout(() => {
                        if (!wrapper.classList.contains('show')) {
                            wrapper.style.display = 'none';
                        }
                    }, 500); // matches CSS duration
                }
            }
        }
    });

    /* --- Conditional Logic Engine (Show/Hide Fields) --- */
    function evaluateConditions(triggerEl) {
        if (!triggerEl.classList.contains('conditional-trigger')) return;

        const targetSelector = triggerEl.getAttribute('data-target');
        const expectedValue = triggerEl.getAttribute('data-trigger-value') || "Yes";
        const targetEl = document.querySelector(targetSelector);

        if (targetEl) {
            if (triggerEl.value === expectedValue) {
                targetEl.style.display = "block";

                // Make inner inputs required if they were meant to be?
                // For a smooth experience, the sub-inputs aren't strictly 'required' by HTML
                // but if we wanted to scale this, we could toggle required attributes here.
            } else {
                targetEl.style.display = "none";
                // Clear out the values so we don't send garbage data for hidden fields
                const hiddenInputs = targetEl.querySelectorAll('input, select, textarea');
                hiddenInputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
                    else {
                        input.value = '';
                        if (input.tagName === 'SELECT') window.updateCustomSelectVisual(input);
                    }

                    // Trigger change in case the hidden element had its own logic (like a smart dropdown)
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        }
    }

    // Bind condition events
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('conditional-trigger')) {
            evaluateConditions(e.target);
        }
    });

    // Initial evaluation for defaults (in case draft restore sets values)
    setTimeout(() => {
        document.querySelectorAll('.conditional-trigger').forEach(evaluateConditions);
    }, 150);

    /* --- Accordion Logic --- */
    const accordions = document.querySelectorAll(".accordion-header");
    accordions.forEach(acc => {
        acc.addEventListener("click", () => {
            const item = acc.parentElement;
            const content = item.querySelector(".accordion-content");
            const isActive = item.classList.contains("active");

            // Toggle current
            if (!isActive) {
                item.classList.add("active");
                content.style.maxHeight = content.scrollHeight + 100 + "px"; // add extra buffer for checkboxes
            } else {
                item.classList.remove("active");
                content.style.maxHeight = null;
            }
        });
    });

    /* --- Refusal Button Logic (Wave 13) --- */
    const btnRefuseHipaa = document.getElementById("btn-refuse-hipaa");
    const hiddenRefuseCheckbox = document.getElementById("hidden-refuse-checkbox");
    const refuseCommentsWrapper = document.getElementById("refuse-comments-wrapper");

    if (btnRefuseHipaa && hiddenRefuseCheckbox && refuseCommentsWrapper) {
        btnRefuseHipaa.addEventListener("click", () => {
            // Toggle the hidden checkbox
            hiddenRefuseCheckbox.checked = !hiddenRefuseCheckbox.checked;

            // Trigger change for local storage auto-save
            hiddenRefuseCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

            if (hiddenRefuseCheckbox.checked) {
                // Button looks pressed
                btnRefuseHipaa.style.background = "var(--error-color)";
                btnRefuseHipaa.style.color = "white";
                // Show comments
                refuseCommentsWrapper.style.display = "block";
                const input = refuseCommentsWrapper.querySelector("input");
                if (input) input.focus();
            } else {
                // Revert button
                btnRefuseHipaa.style.background = "transparent";
                btnRefuseHipaa.style.color = "var(--error-color)";
                // Hide comments and clear them
                refuseCommentsWrapper.style.display = "none";
                const input = refuseCommentsWrapper.querySelector("input");
                if (input) {
                    input.value = "";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        // Initial state check (for drafts restore)
        setTimeout(() => {
            if (hiddenRefuseCheckbox.checked) {
                btnRefuseHipaa.style.background = "var(--error-color)";
                btnRefuseHipaa.style.color = "white";
                refuseCommentsWrapper.style.display = "block";
            }
        }, 200);
    }


    /* --- Signature Pad Logic --- */
    const canvas = document.getElementById("signature-pad");
    const guardianCanvas = document.getElementById("guardian-signature-pad");
    const witnessCanvas = document.getElementById("witness-signature-pad");
    const staffCanvas = document.getElementById("staff-signature-pad");

    let isDrawing = false;
    let signatureEmpty = true;
    let guardianSignatureEmpty = true;
    let witnessSignatureEmpty = true;
    let staffSignatureEmpty = true;

    function initCanvas(c) {
        if (!c) return null;
        const ctx = c.getContext("2d");
        ctx.strokeStyle = "#0d47a1";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        return ctx;
    }

    const ctx = initCanvas(canvas);
    const gCtx = initCanvas(guardianCanvas);
    const wCtx = initCanvas(witnessCanvas);
    const sCtx = initCanvas(staffCanvas);

    function resizeCanvas() {
        [
            { c: canvas, ctx: ctx, isEmpty: () => signatureEmpty },
            { c: guardianCanvas, ctx: gCtx, isEmpty: () => guardianSignatureEmpty },
            { c: witnessCanvas, ctx: wCtx, isEmpty: () => witnessSignatureEmpty },
            { c: staffCanvas, ctx: sCtx, isEmpty: () => staffSignatureEmpty }
        ].forEach(item => {
            const c = item.c;
            const context = item.ctx;
            if (!c || !context || c.offsetWidth === 0) return;

            let currentImg = null;
            if (!item.isEmpty()) {
                currentImg = c.toDataURL();
            }

            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            c.width = c.offsetWidth * ratio;
            c.height = c.offsetHeight * ratio;
            context.scale(ratio, ratio);

            context.strokeStyle = "#0d47a1";
            context.lineWidth = 3;
            context.lineCap = "round";
            context.lineJoin = "round";

            if (currentImg) {
                let img = new Image();
                img.onload = function () {
                    context.drawImage(img, 0, 0, c.width / ratio, c.height / ratio);
                }
                img.src = currentImg;
            }
        });
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeCanvas, 150);
    });

    function getMousePos(e, c) {
        const rect = c.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startPosition(e, c, context, padType) {
        if (e.cancelable) e.preventDefault();
        isDrawing = true;
        if (padType === 'guardian') guardianSignatureEmpty = false;
        else if (padType === 'witness') witnessSignatureEmpty = false;
        else if (padType === 'staff') staffSignatureEmpty = false;
        else signatureEmpty = false;

        const pos = getMousePos(e, c);
        context.beginPath();
        context.moveTo(pos.x, pos.y);
    }

    function endPosition(e) {
        if (e.cancelable) e.preventDefault();
        isDrawing = false;
    }

    function draw(e, c, context) {
        if (!isDrawing) return;
        if (e.cancelable) e.preventDefault();

        const pos = getMousePos(e, c);
        context.lineTo(pos.x, pos.y);
        context.stroke();
        context.beginPath();
        context.moveTo(pos.x, pos.y);
    }

    // Attach events for a specific canvas
    function attachEvents(c, context, padType) {
        if (!c || !context) return;
        c.addEventListener("mousedown", (e) => startPosition(e, c, context, padType));
        c.addEventListener("mouseup", endPosition);
        c.addEventListener("mousemove", (e) => draw(e, c, context));
        c.addEventListener("mouseleave", endPosition);

        c.addEventListener("touchstart", (e) => startPosition(e, c, context, padType), { passive: false });
        c.addEventListener("touchend", endPosition, { passive: false });
        c.addEventListener("touchmove", (e) => draw(e, c, context), { passive: false });
    }

    attachEvents(canvas, ctx, 'patient');
    attachEvents(guardianCanvas, gCtx, 'guardian');
    attachEvents(witnessCanvas, wCtx, 'witness');
    attachEvents(staffCanvas, sCtx, 'staff');

    const clearSigBtn = document.getElementById("clear-signature");
    if (clearSigBtn && canvas) {
        clearSigBtn.addEventListener("click", () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            signatureEmpty = true;
        });
    }

    const clearGuardianSigBtn = document.getElementById("clear-guardian-signature");
    if (clearGuardianSigBtn && guardianCanvas) {
        clearGuardianSigBtn.addEventListener("click", () => {
            gCtx.clearRect(0, 0, guardianCanvas.width, guardianCanvas.height);
            guardianSignatureEmpty = true;
        });
    }

    const clearWitnessSigBtn = document.getElementById("clear-witness-signature");
    if (clearWitnessSigBtn && witnessCanvas) {
        clearWitnessSigBtn.addEventListener("click", () => {
            wCtx.clearRect(0, 0, witnessCanvas.width, witnessCanvas.height);
            witnessSignatureEmpty = true;
        });
    }

    const clearStaffSigBtn = document.getElementById("clear-staff-signature");
    if (clearStaffSigBtn && staffCanvas) {
        clearStaffSigBtn.addEventListener("click", () => {
            sCtx.clearRect(0, 0, staffCanvas.width, staffCanvas.height);
            staffSignatureEmpty = true;
        });
    }
    /* --- Auto-Sum Finances --- */
    const incomeInputs = [
        "INCOME_WAGES", "INCOME_UNEMPLOYMENT", "INCOME_PENSION",
        "INCOME_CHILD_SUPPORT", "INCOME_SSI_SSDI", "INCOME_TCA",
        "INCOME_VETERANS_BENEFITS", "INCOME_TDAP", "INCOME_ALIMONY", "INCOME_OTHER"
    ];
    const totalInput = document.querySelector('input[name="INCOME_TOTAL"]');
    if (totalInput) {
        const inputs = incomeInputs.map(name => document.querySelector(`input[name="${name}"]`)).filter(Boolean);
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                let total = 0;
                inputs.forEach(i => {
                    const val = parseFloat(i.value);
                    if (!isNaN(val)) total += val;
                });
                totalInput.value = total.toFixed(2);
            });
        });
    }

    /* --- Input Masking (Phone & SSN) --- */
    const formatPhone = (val) => {
        const x = val.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
        return !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    };

    const formatSSN = (val) => {
        const x = val.replace(/\D/g, '').match(/(\d{0,3})(\d{0,2})(\d{0,4})/);
        return !x[2] ? x[1] : x[1] + '-' + x[2] + (x[3] ? '-' + x[3] : '');
    };

    document.addEventListener('input', (e) => {
        if (e.target.type === 'tel') {
            const oldVal = e.target.value;
            const newVal = formatPhone(oldVal);
            if (oldVal !== newVal) e.target.value = newVal;
        } else if (e.target.name === 'PATIENT_SSN') {
            const oldVal = e.target.value;
            const newVal = formatSSN(oldVal);
            if (oldVal !== newVal) e.target.value = newVal;
        }
    });

    /* --- LocalStorage Auto-Save & Restore --- */
    const LOCAL_STORAGE_KEY = "clinicIntakeFormDraft";
    const appForm = document.getElementById("intake-form");

    // Retrieve Draft function
    function restoreDraft() {
        const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedDraft) {
            try {
                const draftObj = JSON.parse(savedDraft);
                Object.keys(draftObj).forEach(key => {
                    const elements = appForm.querySelectorAll(`[name="${key}"], [data-name="${key}"]`);
                    if (elements.length > 0) {
                        elements.forEach(el => {
                            if (el.type === 'checkbox' || el.type === 'radio') {
                                if (draftObj[key] === el.value || (Array.isArray(draftObj[key]) && draftObj[key].includes(el.value))) {
                                    el.checked = true;
                                }
                            } else {
                                el.value = draftObj[key];
                                if (el.tagName === 'SELECT') window.updateCustomSelectVisual(el);
                            }
                            // Dispatch change event to trigger smart helpers (age calc, others dropdown...)
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                        });
                    }
                });
                // Small toast notification for user
                const toast = document.createElement('div');
                toast.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Draft restored successfully`;
                toast.style.cssText = "position:fixed;bottom:20px;right:20px;background:var(--primary-color);color:white;padding:10px 20px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fadeIn 0.5s ease;";
                document.body.appendChild(toast);
                setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 500); }, 3000);
            } catch (e) { console.warn("Could not restore draft", e); }
        }
    }

    // Save draft smoothly on input changes
    appForm.addEventListener('change', () => {
        const formData = new FormData(appForm);
        const dataObj = {};
        for (let [key, val] of formData.entries()) {
            if (!dataObj[key]) dataObj[key] = val;
            else {
                if (!Array.isArray(dataObj[key])) dataObj[key] = [dataObj[key]];
                dataObj[key].push(val);
            }
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataObj));
    });

    // Run restore AFTER DOM fully parsed
    setTimeout(restoreDraft, 100);

    /* --- Form Submission & Webhook --- */
    const form = document.getElementById("intake-form");
    const submitBtn = document.getElementById("submit-btn");
    const submitText = submitBtn.querySelector(".btn-text");
    const submitLoader = document.getElementById("submit-loader");
    const successScreen = document.getElementById("success-screen");
    const errorAlert = document.getElementById("error-alert");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorAlert.style.display = "none";

        if (!validateCurrentWave()) return;

        // Check if HIPAA signature is refused
        const hiddenRefuseCheckbox = document.getElementById("hidden-refuse-checkbox");
        if (hiddenRefuseCheckbox && hiddenRefuseCheckbox.checked) {
            // Patient refused to sign -> Do NOT call n8n webhook
            console.log("Patient refused to sign HIPAA. Webhook will not be called.");

            // Fake success state for demo purposes without hitting webhook
            submitBtn.disabled = true;
            submitText.style.display = "none";
            submitLoader.style.display = "inline-block";

            form.style.display = "none";
            document.querySelector(".app-header").style.display = "none";
            successScreen.classList.remove("hidden");

            // Skip countdown since it won't be generating anything from webhook
            const countdownContainerEl = document.getElementById("countdown-container");
            countdownContainerEl.style.display = "none";

            const documentReadyMessage = document.getElementById("document-ready-message");
            documentReadyMessage.innerHTML = `<p style="color: #ed6c02; font-weight: 600; font-size: 1.1rem; margin: 0;"><i class="fa-solid fa-triangle-exclamation"></i> Your file has been saved locally, but is limited due to your refusal to sign.</p>`;
            documentReadyMessage.style.backgroundColor = "#fff4e5";
            documentReadyMessage.style.borderColor = "#ff9800";
            documentReadyMessage.style.display = "block";

            localStorage.removeItem(LOCAL_STORAGE_KEY);
            return;
        }

        // Helper: strip the data URL prefix, n8n convertToFile expects raw base64
        const stripPrefix = (dataUrl) => dataUrl.replace(/^data:image\/png;base64,/, '');

        // 1. Convert Patient Canvas to Base64 Image (empty string if not signed)
        const base64Signature = (!signatureEmpty && canvas) ? stripPrefix(canvas.toDataURL("image/png")) : "";

        // Use new pads for Staff and Witness (Optional — empty string if not signed)
        const base64WitnessSignature = (!witnessSignatureEmpty && witnessCanvas) ? stripPrefix(witnessCanvas.toDataURL("image/png")) : "";
        const base64StaffSignature = (!staffSignatureEmpty && staffCanvas) ? stripPrefix(staffCanvas.toDataURL("image/png")) : "";

        // 2. Gather All Form Variables
        const formData = new FormData(form);
        // Clean Payload - We will ONLY send variables known to exist in the user's workflow template
        const allowedVariables = [
            "ALCOHOL_YN", "ANXIETY_ONSET", "ANXIETY_YN", "APPETITE_ISSUES", "AUTH_CONSENT_YN", "AUTH_COORDINATION",
            "AUTH_DISCHARGE", "AUTH_FINANCIAL", "AUTH_INTAKE_SUMMARY", "AUTH_MEDICATIONS", "AUTH_NOTIF_TREATMENT",
            "AUTH_OTHER", "AUTH_PAST_TREATMENT", "AUTH_PERIOD_FROM", "AUTH_PERIOD_TO", "AUTH_PSYCH_DIAG", "AUTH_PSYCH_EVAL",
            "AUTH_RELATIONSHIP", "AUTH_TREATMENT_SUMMARY", "AUTH_VERBAL", "CHRONIC_PAIN_DESC", "CHRONIC_PAIN_YN",
            "CLIENT_SIGNATURE", "CURRENT_MEDS_LIST", "CURRENT_MEDS_YN", "DEPRESSION_DURATION", "DEPRESSION_YN",
            "DRUG_USE_FREQUENCY", "EMERGENCY_CONTACT_NAME", "EMERGENCY_CONTACT_PHONE", "EMERGENCY_CONTACT_RELATION",
            "EMPLOYED_YN", "EMPLOYMENT_DETAILS", "EXCHANGE_AGENCY_ADDRESS", "EXCHANGE_AGENCY_FAX", "EXCHANGE_AGENCY_NAME",
            "EXCHANGE_AGENCY_PHONE", "EXERCISE_DETAILS", "FH_ALCOHOL_SUBSTANCE_ABUSE_MEMBER", "FH_ALCOHOL_SUBSTANCE_ABUSE_YN",
            "FH_ANXIETY_MEMBER", "FH_ANXIETY_YN", "FH_DEPRESSION_MEMBER", "FH_DEPRESSION_YN", "FH_DOMESTIC_VIOLENCE_MEMBER",
            "FH_DOMESTIC_VIOLENCE_YN", "FH_EATING_DISORDERS_MEMBER", "FH_EATING_DISORDERS_YN", "FH_OBESITY_MEMBER", "FH_OBESITY_YN",
            "FH_OBSESSIVE_COMPULSIVE_BEHAVIOR_MEMBER", "FH_OBSESSIVE_COMPULSIVE_BEHAVIOR_YN", "FH_SCHIZOPHRENIA_MEMBER",
            "FH_SCHIZOPHRENIA_YN", "FH_SUICIDE_ATTEMPTS_MEMBER", "FH_SUICIDE_ATTEMPTS_YN",
            "FINAL_GUARDIAN_PRINT_NAME", "FINAL_LEGAL_REP_NAME", "FINAL_PATIENT_PRINT_NAME", "FINAL_REFUSE_COMMENTS",
            "GUARDIAN_NAME", "GUARDIAN_SIGNATURE", "HH_MEMBER_1_INCOME", "HH_MEMBER_1_NAME", "HH_MEMBER_1_RELATION",
            "HH_MEMBER_2_INCOME", "HH_MEMBER_2_NAME", "HH_MEMBER_2_RELATION", "HH_MEMBER_3_INCOME", "HH_MEMBER_3_NAME",
            "HH_MEMBER_3_RELATION", "HH_MEMBER_4_INCOME", "HH_MEMBER_4_NAME", "HH_MEMBER_4_RELATION", "HOUSING_ACCOMMODATION_DETAILS",
            "HOUSING_ACCOMMODATION_YN", "HOUSING_AGENCY_NAME", "HOUSING_ASSISTANCE_TYPE", "HOUSING_ASSISTANCE_YN",
            "HOUSING_DEPOSIT_FUNDS_YN", "HOUSING_LEAVE_DATE_YN", "HOUSING_LEAVE_DETAILS", "HOUSING_LEAVE_REASON", "HOUSING_OTHER_AGENCY_YN",
            "HOUSING_RENT_ARREARS_YN", "HOUSING_STAY_REASON", "HOUSING_TEMP_DURATION", "HOUSING_TEMP_STAY_YN", "HOUSING_UTIL_ARREARS_YN",
            "HOUSING_WANT_LEAVE_YN", "HOUSING_WANT_STAY_YN", "INCOME_ALIMONY", "INCOME_CHILD_SUPPORT", "INCOME_OTHER", "INCOME_PENSION",
            "INCOME_SSI_SSDI", "INCOME_TCA", "INCOME_TDAP", "INCOME_TOTAL", "INCOME_UNEMPLOYMENT", "INCOME_VETERANS_BENEFITS", "INCOME_WAGES",
            "INSURANCE_MEMBER_ID", "INSURANCE_PROVIDER", "LIFE_STRESSORS", "MONTHLY_RENT",
            "PATIENT_ADDRESS", "PATIENT_ADDRESS_2", "PATIENT_AGE", "PATIENT_CELL_PHONE", "PATIENT_CITY",
            "PATIENT_DOB", "PATIENT_EMAIL", "PATIENT_FULL_NAME", "PATIENT_GENDER", "PATIENT_HOME_PHONE",
            "PATIENT_LANGUAGE", "PATIENT_LEGAL_NAME", "PATIENT_MARITAL_STATUS", "PATIENT_PREFERRED_NAME",
            "PATIENT_SSN", "PATIENT_STATE", "PATIENT_TYPE", "PATIENT_ZIP",
            "PERSONAL_STRENGTHS", "PERSONAL_WEAKNESSES", "PHYSICAL_HEALTH_NOTES", "PHYSICAL_HEALTH_RATING",
            "PREV_MH_SERVICES_YN", "PREV_THERAPIST", "PRP_DELAY_REASON", "PRP_ENROLLMENT_DATE", "PRP_Q1_EXPLANATION", "PRP_Q1",
            "PRP_Q2_EXPLANATION", "PRP_Q2", "PRP_Q3_EXPLANATION", "PRP_Q3", "PRP_Q3A", "PRP_Q3B", "PRP_Q4_EXPLANATION", "PRP_Q4",
            "PRP_SCREENING_STATUS", "PSYCH_MEDS_HISTORY_YN", "PSYCH_MEDS_LIST", "REASON_FOR_REFERRAL", "REFERRAL_DATE", "REFERRED_BY",
            "RELATIONSHIP_DETAILS", "RELATIONSHIP_YN", "RENT_AMOUNT_OWED",
            "SCREENING_PARTICIPANT_1", "SCREENING_PARTICIPANT_2", "SCREENING_PARTICIPANT_3",
            "SCREENING_RELATION_1", "SCREENING_RELATION_2", "SCREENING_RELATION_3",
            "SCREENING_STAFF_NAME", "SCREENING_STAFF_TITLE", "SIGNATURE_DATE", "SLEEPING_HABITS_NOTES",
            "SLEEPING_HABITS_RATING", "SPIRITUAL_DETAILS", "SPIRITUAL_YN", "STAFF_NAME", "STAFF_SIGNATURE", "STAFF_TITLE", "THERAPY_GOALS",
            "UTIL_AMOUNT_OWED", "UTIL_ELECTRICITY_MONTHLY", "UTIL_HEAT_MONTHLY", "UTIL_OTHER_UTIL_MONTHLY", "UTIL_PHONE_MONTHLY",
            "VOICEMAIL_CELL", "VOICEMAIL_EMAIL", "VOICEMAIL_HOME", "WITNESS_NAME", "WITNESS_SIGNATURE"
        ];

        // Also allowed are Explicit Checkbox fields which get converted to Emojis (e.g. AUTH_NOTIF_TREATMENT, etc.)

        const rawDataPayload = Object.fromEntries(formData.entries());
        const dataPayload = {};

        // Make sure all required checkboxes/radios have at least an empty presence in the raw payload
        const allNamedInputs = form.querySelectorAll('[name]');
        allNamedInputs.forEach(el => {
            if (el.name && !rawDataPayload.hasOwnProperty(el.name)) {
                rawDataPayload[el.name] = "";
            }
        });

        // Map and Filter to final Payload
        Object.keys(rawDataPayload).forEach(key => {
            // Keep it if it's in the allowed list or if it's a checkbox Emoji rule
            const isAuthorized = allowedVariables.includes(key) || key.startsWith("AUTH_");
            if (isAuthorized) {
                dataPayload[key] = rawDataPayload[key];
            }
        });

        /* 
           3. Mapping Signatures and Dates
        */
        dataPayload.CLIENT_SIGNATURE = base64Signature;
        dataPayload.WITNESS_SIGNATURE = base64WitnessSignature;
        dataPayload.STAFF_SIGNATURE = base64StaffSignature;

        // Default language to English if not selected
        if (!dataPayload.PATIENT_LANGUAGE || dataPayload.PATIENT_LANGUAGE === "") {
            dataPayload.PATIENT_LANGUAGE = "English";
        }

        // Map dates automatically to the current date for all signature dates
        const today = new Date().toLocaleDateString("en-US"); // Formats MM/DD/YYYY

        dataPayload.SIGNATURE_DATE = today;

        // Conditional Legal Guardian / Representative Signatures
        const ageInputFinal = document.querySelector('input[name="PATIENT_AGE"]');
        const isMinor = ageInputFinal && parseInt(ageInputFinal.value, 10) < 18;

        if (isMinor) {
            if (guardianSignatureEmpty && guardianCanvas) {
                errorAlert.innerText = "Please sign in the Legal Guardian section (Step 3).";
                errorAlert.style.display = "block";

                // Switch back to wave 3 visually so they can sign
                currentStep = 2; // Wave 3 is index 2
                updateWizard();
                guardianCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const base64GuardianSignature = guardianCanvas ? stripPrefix(guardianCanvas.toDataURL("image/png")) : "";
            dataPayload.GUARDIAN_SIGNATURE = base64GuardianSignature;
        } else {
            dataPayload.GUARDIAN_SIGNATURE = "";
        }

        // Make sure checkboxes get recorded nicely if they are checked
        // the default forms api does not send unchecked boxes, n8n will see them as `undefined`.
        // We ensure "blank" vs "checked" using corresponding Emojis:
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(chk => {
            // Check if this checkbox key made it to the restricted dataPayload
            if (Object.hasOwn(dataPayload, chk.name) || chk.name.startsWith("AUTH_")) {
                if (!chk.checked) {
                    dataPayload[chk.name] = "❌"; // Unchecked box emoji
                } else {
                    dataPayload[chk.name] = "✅"; // Checked box emoji
                }
            }
        });

        console.log("📤 Sending exact payload mapped for the Document Template:");
        console.log(dataPayload);

        // 4. UI State (Show Success Screen & Start Countdown Immediately)
        submitBtn.disabled = true;
        submitText.style.display = "none";
        submitLoader.style.display = "inline-block";

        form.style.display = "none";
        document.querySelector(".app-header").style.display = "none";
        successScreen.classList.remove("hidden");

        // 5. Start 90 Second Countdown
        const countdownTimerEl = document.getElementById("countdown-timer");
        const countdownContainerEl = document.getElementById("countdown-container");
        const documentReadyMessage = document.getElementById("document-ready-message");

        let timeLeft = 90;
        countdownTimerEl.innerText = "01:30";




        // Show download link immediately when response arrives
        const showResult = (response, error) => {
            clearInterval(timerInterval);
            countdownContainerEl.style.display = "none";

            if (error) {
                console.error("Webhook error:", error);
                errorAlert.innerText = "Connection error: " + error.message + ". The n8n webhook could not complete.";
                errorAlert.style.display = "block";
                successScreen.classList.add("hidden");
                form.style.display = "block";
                document.querySelector(".app-header").style.display = "block";
                submitBtn.disabled = false;
                submitText.style.display = "inline-flex";
                submitLoader.style.display = "none";
            } else if (response) {
                // Parse n8n response (it might be an array or direct object)
                const data = Array.isArray(response) ? response[0] : response;

                documentReadyMessage.style.display = "block";
                documentReadyMessage.style.background = "var(--card-bg)";
                documentReadyMessage.style.borderColor = "var(--accent-color)";
                documentReadyMessage.style.color = "var(--text-color)";

                const linksContainer = document.getElementById("download-links-container");
                if (linksContainer) {
                    linksContainer.innerHTML = ""; // Clear
                    linksContainer.style.display = "grid";

                    // 1. View / Edit Link (Google Doc)
                    if (data.document_link) {
                        const btn = document.createElement("a");
                        btn.href = data.document_link;
                        btn.target = "_blank";
                        btn.className = "download-btn btn-edit";
                        btn.innerHTML = `<i class="fa-solid fa-file-lines"></i> View / Edit Online`;
                        linksContainer.appendChild(btn);
                    }

                    // 2. PDF Download
                    if (data.download_pdf) {
                        const btn = document.createElement("a");
                        btn.href = data.download_pdf;
                        btn.target = "_blank";
                        btn.className = "download-btn btn-pdf";
                        btn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Download PDF`;
                        linksContainer.appendChild(btn);
                    }

                    // 3. DOCX Download
                    if (data.download_docx) {
                        const btn = document.createElement("a");
                        btn.href = data.download_docx;
                        btn.target = "_blank";
                        btn.className = "download-btn btn-docx";
                        btn.innerHTML = `<i class="fa-solid fa-file-word"></i> Download Word (DOCX)`;
                        linksContainer.appendChild(btn);
                    }
                }

                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        };

        // Immediately resolve when n8n responds (no waiting for timer)
        fetch(API_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataPayload)
        }).then(res => {
            if (!res.ok) throw new Error("Webhook returned a non-200 status.");
            return res.json();
        }).then(data => {
            showResult(data, null);
        }).catch(err => {
            console.warn("Fetch issue:", err);
            showResult(null, err);
        });

        // Fallback countdown (only if fetch takes very long)
        const timerInterval = setInterval(() => {
            timeLeft--;
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');
            countdownTimerEl.innerText = `${m}:${s}`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                // If still no response after 90s, show generic success
                if (countdownContainerEl.style.display !== 'none') {
                    showResult(null, null);
                }
            }
        }, 1000);

    });

    // === UX Auto-helpers ===

    // Auto-format SSN (xxx-xx-xxxx)
    const ssnInput = document.querySelector('input[name="PATIENT_SSN"]');
    if (ssnInput) {
        ssnInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').substring(0, 9);
            if (v.length > 5) v = v.slice(0, 3) + '-' + v.slice(3, 5) + '-' + v.slice(5);
            else if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
            e.target.value = v;
        });
    }

    // Auto-format phone numbers (xxx) xxx-xxxx — US format
    document.querySelectorAll('input[type="tel"]').forEach(tel => {
        tel.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').substring(0, 10);
            if (v.length > 6) v = '(' + v.slice(0, 3) + ') ' + v.slice(3, 6) + '-' + v.slice(6);
            else if (v.length > 3) v = '(' + v.slice(0, 3) + ') ' + v.slice(3);
            else if (v.length > 0) v = '(' + v;
            e.target.value = v;
        });
    });

    // ===================================================================
    //  🚀 UX IMPROVEMENTS SUITE
    // ===================================================================

    // --- 1. AUTO-SAVE INDICATOR (shows "Draft saved ✓" every 30s) ---
    const autoSaveIndicator = document.createElement('div');
    autoSaveIndicator.id = 'auto-save-indicator';
    autoSaveIndicator.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Draft saved';
    autoSaveIndicator.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(16,185,129,0.95);color:white;padding:8px 16px;border-radius:20px;font-size:0.85rem;z-index:9999;opacity:0;transition:opacity 0.4s ease;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(autoSaveIndicator);

    setInterval(() => {
        if (typeof saveDraft === 'function') saveDraft();
        autoSaveIndicator.style.opacity = '1';
        setTimeout(() => { autoSaveIndicator.style.opacity = '0'; }, 2500);
    }, 30000);

    // --- 2. SSN EYE TOGGLE (mask/unmask) ---
    const ssnField = document.querySelector('input[name="PATIENT_SSN"]');
    if (ssnField) {
        ssnField.type = 'password';
        ssnField.style.letterSpacing = '2px';
        const eyeBtn = document.createElement('button');
        eyeBtn.type = 'button';
        eyeBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        eyeBtn.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-light);cursor:pointer;font-size:1rem;padding:4px;';
        eyeBtn.title = 'Show/Hide SSN';
        const ssnParent = ssnField.parentElement;
        ssnParent.style.position = 'relative';
        ssnParent.appendChild(eyeBtn);
        eyeBtn.addEventListener('click', () => {
            if (ssnField.type === 'password') {
                ssnField.type = 'text';
                ssnField.style.letterSpacing = 'normal';
                eyeBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
            } else {
                ssnField.type = 'password';
                ssnField.style.letterSpacing = '2px';
                eyeBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            }
        });
    }

    // --- 3. KEYBOARD SHORTCUTS (Enter = next, Escape = back) ---
    document.addEventListener('keydown', (e) => {
        // Don't interfere with textareas or signature pads
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'CANVAS') return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const activeWave = document.querySelector('.wave.active');
            if (activeWave) {
                const nextBtn = activeWave.querySelector('.next-btn');
                if (nextBtn) nextBtn.click();
            }
        }
        if (e.key === 'Escape') {
            const activeWave = document.querySelector('.wave.active');
            if (activeWave) {
                const prevBtn = activeWave.querySelector('.prev-btn');
                if (prevBtn) prevBtn.click();
            }
        }
    });

    // --- 4. ESTIMATED TIME REMAINING ---
    const stepIndicator = document.querySelector('.step-indicator');
    if (stepIndicator) {
        const totalSteps = 14;
        const avgMinPerStep = 1; // ~1 min per step
        const updateTimeEstimate = () => {
            const currentStepEl = document.getElementById('current-step');
            if (currentStepEl) {
                const curr = parseInt(currentStepEl.textContent);
                const remaining = Math.max(1, totalSteps - curr);
                const timeText = remaining <= 2 ? 'Almost done!' : `~${remaining} min left`;
                let timeEl = document.getElementById('time-estimate');
                if (!timeEl) {
                    timeEl = document.createElement('span');
                    timeEl.id = 'time-estimate';
                    timeEl.style.cssText = 'margin-left:10px;color:var(--accent-color);font-weight:500;font-size:0.85rem;';
                    stepIndicator.appendChild(timeEl);
                }
                timeEl.textContent = `• ${timeText}`;
            }
        };
        // Update on step change
        const observer = new MutationObserver(updateTimeEstimate);
        const currentStepSpan = document.getElementById('current-step');
        if (currentStepSpan) {
            observer.observe(currentStepSpan, { childList: true, characterData: true, subtree: true });
        }
        updateTimeEstimate();
    }

    // --- 5. ZIP CODE AUTO-FILL (City + State from ZIP) ---
    const zipInput = document.querySelector('input[name="PATIENT_ZIP"]');
    const cityInput = document.querySelector('input[name="PATIENT_CITY"]');
    const stateInput = document.querySelector('input[name="PATIENT_STATE"]');
    if (zipInput && cityInput && stateInput) {
        zipInput.addEventListener('blur', async () => {
            const zip = zipInput.value.trim();
            if (/^\d{5}$/.test(zip)) {
                try {
                    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.places && data.places.length > 0) {
                            cityInput.value = data.places[0]['place name'];
                            stateInput.value = data.places[0]['state'];
                            cityInput.style.borderColor = 'var(--success-color)';
                            stateInput.style.borderColor = 'var(--success-color)';
                            setTimeout(() => {
                                cityInput.style.borderColor = '';
                                stateInput.style.borderColor = '';
                            }, 2000);
                        }
                    }
                } catch (err) { /* Silently fail - user can type manually */ }
            }
        });
    }

    // --- 6. COPY ADDRESS FROM WAVE 1 TO WAVE 9 ---
    const wave9Address = document.querySelector('input[name="PATIENT_ADDRESS"][data-step="9"]') ||
        document.querySelector('[data-step="9"] input[name="PATIENT_ADDRESS"]');
    // Add a "Copy from Step 1" button to Wave 9 if address field exists
    const wave9Section = document.querySelector('[data-step="9"]');
    if (wave9Section) {
        const addrField = wave9Section.querySelector('input[name="PATIENT_ADDRESS"]');
        if (addrField) {
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn-clear';
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy address from Step 1';
            copyBtn.style.cssText = 'margin-bottom:10px;font-size:0.85rem;';
            copyBtn.addEventListener('click', () => {
                const srcAddr = document.querySelector('textarea[name="PATIENT_ADDRESS"]');
                if (srcAddr && srcAddr.value) {
                    addrField.value = srcAddr.value;
                    addrField.style.borderColor = 'var(--success-color)';
                    setTimeout(() => addrField.style.borderColor = '', 2000);
                }
            });
            addrField.parentElement.insertBefore(copyBtn, addrField);
        }
    }

    // --- 7. SESSION TIMEOUT WARNING (20 min inactivity) ---
    let sessionTimer;
    let lastSessionReset = 0;
    const SESSION_TIMEOUT = 20 * 60 * 1000; // 20 minutes
    const resetSessionTimer = () => {
        const now = Date.now();
        if (now - lastSessionReset < 2000) return; // Throttle to prevent lag on mousemove
        lastSessionReset = now;

        clearTimeout(sessionTimer);
        sessionTimer = setTimeout(() => {
            const warning = document.createElement('div');
            warning.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
            warning.innerHTML = `
                <div style="background:white;padding:30px;border-radius:16px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <i class="fa-solid fa-clock" style="font-size:3rem;color:var(--error-color);margin-bottom:15px;display:block;"></i>
                    <h3 style="margin-bottom:10px;">Are you still there?</h3>
                    <p style="color:#666;margin-bottom:20px;">You've been inactive for 20 minutes. Your draft is saved, but please continue to avoid losing your session.</p>
                    <button type="button" class="btn btn-primary" style="width:100%;" onclick="this.closest('div').parentElement.remove();">
                        <i class="fa-solid fa-check"></i> I'm still here
                    </button>
                </div>`;
            document.body.appendChild(warning);
        }, SESSION_TIMEOUT);
    };
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetSessionTimer, { passive: true });
    });
    resetSessionTimer();

    // --- 8. ENHANCED VALIDATION TOOLTIPS ---
    const validationMessages = {
        'PATIENT_FULL_NAME': 'Please enter your full legal name (first and last)',
        'PATIENT_DOB': 'Please select your date of birth',
        'PATIENT_AGE': 'Please enter your age (0-150)',
        'PATIENT_SSN': 'Please enter a valid SSN: XXX-XX-XXXX',
        'PATIENT_ADDRESS': 'Please enter your full mailing address',
        'EMERGENCY_CONTACT_NAME': 'Please enter an emergency contact name',
        'EMERGENCY_CONTACT_PHONE': 'Please enter a valid 10-digit phone number',
        'FINAL_PATIENT_PRINT_NAME': 'Please print your name to confirm'
    };

    document.querySelectorAll('[required]').forEach(field => {
        const msg = validationMessages[field.name];
        if (msg) field.title = msg;
        field.addEventListener('invalid', (e) => {
            e.preventDefault();
            field.style.borderColor = 'var(--error-color)';
            field.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)';
            // Show tooltip
            let tooltip = field.parentElement.querySelector('.validation-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.className = 'validation-tooltip';
                tooltip.style.cssText = 'color:var(--error-color);font-size:0.8rem;margin-top:4px;animation:fadeIn 0.3s ease;';
                field.parentElement.appendChild(tooltip);
            }
            tooltip.textContent = msg || 'This field is required';
        });
        field.addEventListener('input', () => {
            field.style.borderColor = '';
            field.style.boxShadow = '';
            const tooltip = field.parentElement.querySelector('.validation-tooltip');
            if (tooltip) tooltip.remove();
        });
    });

    // --- 9. SKIP OPTIONAL SECTIONS LINK ---
    const optionalWaves = [10, 11, 12]; // Housing, Finances, Authorization
    optionalWaves.forEach(step => {
        const wave = document.querySelector(`[data-step="${step}"]`);
        if (wave) {
            const actionsDiv = wave.querySelector('.actions');
            if (actionsDiv) {
                const skipLink = document.createElement('button');
                skipLink.type = 'button';
                skipLink.className = 'btn-skip';
                skipLink.innerHTML = '<i class="fa-solid fa-forward"></i> Skip this section (optional)';
                skipLink.style.cssText = 'background:none;border:none;color:var(--text-light);cursor:pointer;font-size:0.85rem;padding:8px 0;display:block;width:100%;text-align:center;margin-top:8px;transition:color 0.2s;';
                skipLink.addEventListener('mouseenter', () => skipLink.style.color = 'var(--secondary-color)');
                skipLink.addEventListener('mouseleave', () => skipLink.style.color = 'var(--text-light)');
                skipLink.addEventListener('click', () => {
                    const nextBtn = wave.querySelector('.next-btn');
                    if (nextBtn) nextBtn.click();
                });
                actionsDiv.parentElement.insertBefore(skipLink, actionsDiv.nextSibling);
            }
        }
    });

    // --- 10. DARK MODE TOGGLE ---
    const darkToggle = document.createElement('button');
    darkToggle.type = 'button';
    darkToggle.id = 'dark-mode-toggle';
    darkToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    darkToggle.title = 'Toggle Dark Mode';
    darkToggle.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--card-bg);border:1px solid var(--border-color);color:var(--text-color);width:44px;height:44px;border-radius:50%;cursor:pointer;font-size:1.1rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.1);transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(darkToggle);

    let isDark = localStorage.getItem('darkMode') === 'true';
    const applyDarkMode = (dark) => {
        if (dark) {
            document.documentElement.style.setProperty('--bg-color', '#0f172a');
            document.documentElement.style.setProperty('--card-bg', 'rgba(30, 41, 59, 0.95)');
            document.documentElement.style.setProperty('--text-color', '#e2e8f0');
            document.documentElement.style.setProperty('--text-light', '#94a3b8');
            document.documentElement.style.setProperty('--border-color', '#334155');
            document.documentElement.style.setProperty('--border-focus', '#38bdf8');
            document.documentElement.style.setProperty('--primary-color', '#7dd3fc');
            document.documentElement.style.setProperty('--secondary-color', '#38bdf8');
            document.documentElement.style.setProperty('--accent-color', '#34d399');
            document.body.style.background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)';
            darkToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            darkToggle.style.background = '#1e293b';
            darkToggle.style.color = '#fbbf24';
            darkToggle.style.borderColor = '#334155';
        } else {
            document.documentElement.style.setProperty('--bg-color', '#f0fdfa');
            document.documentElement.style.setProperty('--card-bg', 'rgba(255, 255, 255, 0.95)');
            document.documentElement.style.setProperty('--text-color', '#1e293b');
            document.documentElement.style.setProperty('--text-light', '#64748b');
            document.documentElement.style.setProperty('--border-color', '#cbd5e1');
            document.documentElement.style.setProperty('--border-focus', '#38bdf8');
            document.documentElement.style.setProperty('--primary-color', '#0c4a6e');
            document.documentElement.style.setProperty('--secondary-color', '#0284c7');
            document.documentElement.style.setProperty('--accent-color', '#059669');
            document.body.style.background = 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)';
            darkToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            darkToggle.style.background = 'var(--card-bg)';
            darkToggle.style.color = 'var(--text-color)';
            darkToggle.style.borderColor = 'var(--border-color)';
        }
        localStorage.setItem('darkMode', dark);
    };
    applyDarkMode(isDark);
    darkToggle.addEventListener('click', () => {
        isDark = !isDark;
        applyDarkMode(isDark);
    });

    // --- 11. FORM SUMMARY PREVIEW ON WAVE 14 ---
    const wave14 = document.querySelector('[data-step="14"]');
    if (wave14) {
        const summaryDiv = document.createElement('div');
        summaryDiv.id = 'form-summary-preview';
        summaryDiv.style.cssText = 'background:var(--bg-color);border:1px solid var(--border-color);border-radius:12px;padding:16px;margin-bottom:20px;max-height:200px;overflow-y:auto;font-size:0.85rem;display:none;';
        const summaryToggle = document.createElement('button');
        summaryToggle.type = 'button';
        summaryToggle.className = 'btn btn-secondary';
        summaryToggle.innerHTML = '<i class="fa-solid fa-list-check"></i> Review Answers Before Signing';
        summaryToggle.style.cssText = 'width:100%;margin-bottom:15px;';
        summaryToggle.addEventListener('click', () => {
            const isVisible = summaryDiv.style.display !== 'none';
            if (!isVisible) {
                // Build summary
                let html = '<h4 style="margin-bottom:10px;color:var(--primary-color);"><i class="fa-solid fa-clipboard-list"></i> Your Answers Summary</h4>';
                const keyFields = [
                    ['Full Name', 'PATIENT_FULL_NAME'],
                    ['Date of Birth', 'PATIENT_DOB'],
                    ['Age', 'PATIENT_AGE'],
                    ['Address', 'PATIENT_ADDRESS'],
                    ['Home Phone', 'PATIENT_HOME_PHONE'],
                    ['Cell Phone', 'PATIENT_CELL_PHONE'],
                    ['Email', 'PATIENT_EMAIL'],
                    ['Gender', 'PATIENT_GENDER'],
                    ['Language', 'PATIENT_LANGUAGE'],
                    ['Insurance', 'INSURANCE_PROVIDER'],
                    ['Emergency Contact', 'EMERGENCY_CONTACT_NAME'],
                    ['Emergency Phone', 'EMERGENCY_CONTACT_PHONE'],
                    ['Physical Health', 'PHYSICAL_HEALTH_RATING'],
                    ['Sleep Quality', 'SLEEPING_HABITS_RATING'],
                    ['Depression', 'DEPRESSION_YN'],
                    ['Anxiety', 'ANXIETY_YN'],
                    ['Employment', 'EMPLOYED_YN'],
                ];
                keyFields.forEach(([label, name]) => {
                    const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`[data-name="${name}"]`);
                    let val = '';
                    if (el) {
                        if (el.tagName === 'SELECT') val = el.options[el.selectedIndex]?.text || '';
                        else val = el.value || '';
                    }
                    if (val) {
                        html += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-light);">${label}</span><strong>${val}</strong></div>`;
                    }
                });
                summaryDiv.innerHTML = html;
                summaryDiv.style.display = 'block';
                summaryToggle.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide Summary';
            } else {
                summaryDiv.style.display = 'none';
                summaryToggle.innerHTML = '<i class="fa-solid fa-list-check"></i> Review Answers Before Signing';
            }
        });
        // Insert before the signature container
        const h2 = wave14.querySelector('h2');
        const waveDesc = wave14.querySelector('.wave-description');
        const insertRef = waveDesc ? waveDesc.nextSibling : h2.nextSibling;
        wave14.insertBefore(summaryToggle, insertRef);
        wave14.insertBefore(summaryDiv, summaryToggle.nextSibling);
    }

    // --- 12. TOUCH-OPTIMIZED SIGNATURE PADS ---
    if ('ontouchstart' in window) {
        document.querySelectorAll('.signature-container canvas').forEach(canvas => {
            canvas.style.minHeight = '180px';
            canvas.style.touchAction = 'none'; // Prevent pinch zoom
        });
    }

    // --- 13. PROGRESS STEP ICONS ---
    // Will be handled via CSS with step counter icons

});

