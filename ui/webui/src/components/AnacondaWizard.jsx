/*
 * Copyright (C) 2022 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with This program; If not, see <http://www.gnu.org/licenses/>.
 */
import cockpit from "cockpit";
import React, { useEffect, useMemo, useState } from "react";

import {
    ActionList,
    Button,
    HelperText,
    HelperTextItem,
    Modal,
    ModalVariant,
    PageSection,
    PageSectionTypes,
    PageSectionVariants,
    Stack,
    useWizardContext,
    Wizard,
    WizardFooterWrapper,
    WizardStep
} from "@patternfly/react-core";

import { InstallationMethod } from "./storage/InstallationMethod.jsx";
import { getDefaultScenario, getScenario } from "./storage/InstallationScenario.jsx";
import { MountPointMapping } from "./storage/MountPointMapping.jsx";
import { DiskEncryption, getStorageEncryptionState } from "./storage/DiskEncryption.jsx";
import { InstallationLanguage } from "./localization/InstallationLanguage.jsx";
import { InstallationProgress } from "./installation/InstallationProgress.jsx";
import { ReviewConfiguration, ReviewConfigurationConfirmModal } from "./review/ReviewConfiguration.jsx";
import { exitGui } from "../helpers/exit.js";
import { usePageLocation } from "hooks";
import { applyStorage, resetPartitioning, } from "../apis/storage.js";

const _ = cockpit.gettext;
const N_ = cockpit.noop;

export const AnacondaWizard = ({ dispatch, isBootIso, osRelease, storageData, localizationData, onCritFail, onAddErrorNotification, title, conf }) => {
    const [isFormValid, setIsFormValid] = useState(false);
    const [stepNotification, setStepNotification] = useState();
    const [isInProgress, setIsInProgress] = useState(false);
    const [isInstallationProgress, setInstallationProgress] = useState(false);
    const [storageEncryption, setStorageEncryption] = useState(getStorageEncryptionState());
    const [storageScenarioId, setStorageScenarioId] = useState(window.sessionStorage.getItem("storage-scenario-id") || getDefaultScenario().id);
    const [reusePartitioning, setReusePartitioning] = useState(false);

    const availableDevices = useMemo(() => {
        return Object.keys(storageData.devices);
    }, [storageData.devices]);

    useEffect(() => {
        /*
         * When disk selection changes or the user re-scans the devices we need to re-create the partitioning.
         * For Automatic partitioning we do it each time we go to review page,
         * but for custom mount assignment we try to reuse the partitioning when possible.
         */
        setReusePartitioning(false);
    }, [availableDevices, storageData.diskSelection.selectedDisks]);

    const language = useMemo(() => {
        for (const l of Object.keys(localizationData.languages)) {
            const locale = localizationData.languages[l].locales.find(locale => locale["locale-id"].v === localizationData.language);

            if (locale) {
                return locale;
            }
        }
    }, [localizationData]);
    const stepsOrder = [
        ...(isBootIso
            ? [{
                component: InstallationLanguage,
                data: { dispatch, languages: localizationData.languages, language: localizationData.language, commonLocales: localizationData.commonLocales },
                id: "installation-language",
                label: _("Welcome"),
            }]
            : []),
        {
            component: InstallationMethod,
            data: { deviceData: storageData.devices, diskSelection: storageData.diskSelection, dispatch },
            id: "installation-method",
            label: _("Installation method"),
        },
        {
            id: "disk-configuration",
            label: _("Disk configuration"),
            steps: [{
                component: MountPointMapping,
                data: { deviceData: storageData.devices, diskSelection: storageData.diskSelection, partitioningData: storageData.partitioning, dispatch, reusePartitioning, setReusePartitioning },
                id: "mount-point-mapping",
                label: _("Manual disk configuration"),
                isHidden: storageScenarioId !== "mount-point-mapping"

            }, {
                component: DiskEncryption,
                id: "disk-encryption",
                label: _("Disk encryption"),
                isHidden: storageScenarioId === "mount-point-mapping"
            }]
        },
        {
            component: ReviewConfiguration,
            data: {
                deviceData: storageData.devices,
                diskSelection: storageData.diskSelection,
                requests: storageData.partitioning ? storageData.partitioning.requests : null,
                language,
                osRelease
            },
            id: "installation-review",
            label: _("Review and install"),
        }
    ];

    const getFlattenedStepsIds = (steps) => {
        const stepIds = [];
        for (const step of steps) {
            if (step.steps) {
                for (const childStep of step.steps) {
                    if (childStep?.isHidden !== true) {
                        stepIds.push(childStep.id);
                    }
                }
            } else {
                stepIds.push(step.id);
            }
        }
        return stepIds;
    };
    const flattenedStepsIds = getFlattenedStepsIds(stepsOrder);

    const { path } = usePageLocation();
    const currentStepId = isBootIso ? path[0] || "installation-language" : path[0] || "installation-method";

    const isFinishedStep = (stepId) => {
        const stepIdx = flattenedStepsIds.findIndex(s => s === stepId);
        return stepIdx === flattenedStepsIds.length - 1;
    };

    const canJumpToStep = (stepId, currentStepId) => {
        const stepIdx = flattenedStepsIds.findIndex(s => s === stepId);
        const currentStepIdx = flattenedStepsIds.findIndex(s => s === currentStepId);
        return stepIdx <= currentStepIdx;
    };

    const componentProps = {
        setIsFormValid,
        onCritFail,
        onAddErrorNotification,
        stepNotification,
        isInProgress,
        storageEncryption,
        setStorageEncryption,
        storageScenarioId,
        isBootIso,
        osRelease,
        setStorageScenarioId: (scenarioId) => {
            window.sessionStorage.setItem("storage-scenario-id", scenarioId);
            setStorageScenarioId(scenarioId);
        },
    };

    const createSteps = (stepsOrder) => {
        return stepsOrder.filter(s => !s.isHidden).map(s => {
            let stepProps = {
                ariaLabel: `${title} content`,
                name: s.label,
                id: s.id,
                stepNavItemProps: { id: s.id },
                ...(s.isExpandable && { isExpandable: true }),
                canJumpTo: canJumpToStep(s.id, currentStepId),
                isFinishedStep: isFinishedStep(s.id),
            };
            if (s.component) {
                stepProps = {
                    ...stepProps,
                    children: (
                        <s.component
                          idPrefix={s.id}
                          {...componentProps}
                          {...s.data}
                        />
                    )
                };
            } else if (s.steps) {
                const subSteps = createSteps(s.steps);
                stepProps = {
                    ...stepProps,
                    steps: subSteps
                };
            }
            return (
                <WizardStep key={s.id} {...stepProps} />
            );
        });
    };
    const steps = createSteps(stepsOrder);

    const goToStep = (currentStep, prevStep) => {
        if (prevStep.prevId !== currentStep.id) {
            // first reset validation state to default
            setIsFormValid(false);
        }

        // Reset the applied partitioning when going back from review page
        if (prevStep.prevId === "installation-review" && currentStep.id !== "installation-progress") {
            setIsInProgress(true);
            resetPartitioning()
                    .then(
                        () => cockpit.location.go([currentStep.id]),
                        () => onCritFail({ context: cockpit.format(N_("Error was hit when going back from $0."), prevStep.prevName) })
                    )
                    .always(() => setIsInProgress(false));
        } else {
            cockpit.location.go([currentStep.id]);
        }
    };

    return (
        <PageSection type={PageSectionTypes.wizard} variant={PageSectionVariants.light}>
            {!isInstallationProgress
                ? (
                    <Wizard
                      id="installation-wizard"
                      footer={<Footer
                        onCritFail={onCritFail}
                        isFormValid={isFormValid}
                        partitioning={storageData.partitioning?.path}
                        setIsFormValid={setIsFormValid}
                        setStepNotification={setStepNotification}
                        isInProgress={isInProgress}
                        setIsInProgress={setIsInProgress}
                        setInstallationProgress={setInstallationProgress}
                        storageEncryption={storageEncryption}
                        storageScenarioId={storageScenarioId}
                        isBootIso={isBootIso}
                      />}
                      nav={{ "aria-label": `${title} steps` }}
                      onStepChange={((event, currentStep, prevStep) => goToStep(currentStep, prevStep))}
                      isVisitRequired
                    >
                        {steps}
                    </Wizard>
                )
                : (
                    <InstallationProgress
                      idPrefix="installation-progress"
                      {...componentProps}
                      onRelease
                    />
                )}
        </PageSection>
    );
};

const Footer = ({
    onCritFail,
    isFormValid,
    setIsFormValid,
    setStepNotification,
    isInProgress,
    partitioning,
    setIsInProgress,
    storageEncryption,
    storageScenarioId,
    setInstallationProgress,
    isBootIso
}) => {
    const [nextWaitsConfirmation, setNextWaitsConfirmation] = useState(false);
    const [quitWaitsConfirmation, setQuitWaitsConfirmation] = useState(false);
    const { activeStep, goToNextStep, goToPrevStep } = useWizardContext();

    const onNext = (activeStep, onNext) => {
        // first reset validation state to default
        setIsFormValid(true);

        if (activeStep.id === "disk-encryption") {
            setIsInProgress(true);

            applyStorage({
                onFail: ex => {
                    console.error(ex);
                    setIsInProgress(false);
                    setStepNotification({ step: activeStep.id, ...ex });
                },
                onSuccess: () => {
                    goToNextStep();

                    // Reset the state after the onNext call. Otherwise,
                    // React will try to render the current step again.
                    setIsInProgress(false);
                    setStepNotification();
                },
                encrypt: storageEncryption.encrypt,
                encryptPassword: storageEncryption.password,
            });
        } else if (activeStep.id === "installation-review") {
            setNextWaitsConfirmation(true);
        } else if (activeStep.id === "mount-point-mapping") {
            setIsInProgress(true);

            applyStorage({
                partitioning,
                onFail: ex => {
                    console.error(ex);
                    setIsInProgress(false);
                    setStepNotification({ step: activeStep.id, ...ex });
                },
                onSuccess: () => {
                    goToNextStep();

                    // Reset the state after the onNext call. Otherwise,
                    // React will try to render the current step again.
                    setIsInProgress(false);
                    setStepNotification();
                },
            });
        } else {
            goToNextStep();
        }
    };

    const onBack = (activeStep, errorHandler) => {
        // first reset validation state to default
        setIsFormValid(true);
        goToPrevStep();
    };

    if (isInProgress) {
        return null;
    }

    const isFirstScreen = (
        activeStep.id === "installation-language" || (activeStep.id === "installation-method" && !isBootIso)
    );

    const nextButtonText = (
        activeStep.id === "installation-review"
            ? getScenario(storageScenarioId).buttonLabel
            : _("Next")
    );

    const reviewWarning = getScenario(storageScenarioId).screenWarning;

    return (
        <WizardFooterWrapper
        >
            <Stack hasGutter>
                {activeStep.id === "installation-review" &&
                    nextWaitsConfirmation &&
                    <ReviewConfigurationConfirmModal
                      idPrefix={activeStep.id}
                      setInstallationProgress={setInstallationProgress}
                      setNextWaitsConfirmation={setNextWaitsConfirmation}
                      storageScenarioId={storageScenarioId}
                    />}
                {quitWaitsConfirmation &&
                    <QuitInstallationConfirmModal
                      exitGui={exitGui}
                      setQuitWaitsConfirmation={setQuitWaitsConfirmation}
                      isBootIso={isBootIso}
                    />}
                {activeStep.id === "installation-method" && !isFormValid &&
                    <HelperText id="next-helper-text">
                        <HelperTextItem
                          variant="indeterminate">
                            {_("To continue, select the devices to install to.")}
                        </HelperTextItem>
                    </HelperText>}
                {activeStep.id === "installation-review" && reviewWarning &&
                    <HelperText id="review-warning-text">
                        <HelperTextItem
                          variant="warning"
                          hasIcon>
                            {reviewWarning}
                        </HelperTextItem>
                    </HelperText>}
                <ActionList>
                    <Button
                      id="installation-back-btn"
                      variant="secondary"
                      isDisabled={isFirstScreen}
                      onClick={() => onBack(
                          activeStep,
                          onCritFail({ context: cockpit.format(N_("Error was hit when going back from $0."), activeStep.name) })
                      )}>
                        {_("Back")}
                    </Button>
                    <Button
                      id="installation-next-btn"
                      variant={activeStep.id === "installation-review" ? "warning" : "primary"}
                      isDisabled={
                          !isFormValid ||
                            nextWaitsConfirmation
                      }
                      onClick={() => onNext(activeStep)}>
                        {nextButtonText}
                    </Button>
                    <Button
                      id="installation-quit-btn"
                      style={{ marginLeft: "var(--pf-v5-c-wizard__footer-cancel--MarginLeft)" }}
                      variant="link"
                      onClick={() => {
                          setQuitWaitsConfirmation(true);
                      }}
                    >
                        {isBootIso ? _("Reboot") : _("Quit")}
                    </Button>
                </ActionList>
            </Stack>
        </WizardFooterWrapper>
    );
};

export const QuitInstallationConfirmModal = ({ exitGui, setQuitWaitsConfirmation, isBootIso }) => {
    return (
        <Modal
          id="installation-quit-confirm-dialog"
          actions={[
              <Button
                id="installation-quit-confirm-btn"
                key="confirm"
                onClick={() => {
                    exitGui();
                }}
                variant="danger"
              >
                  {isBootIso ? _("Reboot") : _("Quit")}
              </Button>,
              <Button
                id="installation-quit-confirm-cancel-btn"
                key="cancel"
                onClick={() => setQuitWaitsConfirmation(false)}
                variant="secondary">
                  {_("Continue installation")}
              </Button>
          ]}
          isOpen
          onClose={() => setQuitWaitsConfirmation(false)}
          title={isBootIso ? _("Reboot system?") : _("Quit installer?")}
          titleIconVariant="warning"
          variant={ModalVariant.small}
        >
            {_("Your progress will not be saved.")}
        </Modal>
    );
};
