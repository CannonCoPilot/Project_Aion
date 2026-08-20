## .scratchpad.jaques.md Update

### Context and Progress Summary

The current task involves recalibrating a task to a higher difficulty level after initial calibration showed a solve rate of 80%, which was deemed insufficient for the "frontier" band. The task was modified to include two new confounders that principal components cannot resolve: cryptic relatedness and differential missingness. These changes were made to ensure the task is more challenging and better reflects the difficulty level intended.

### Key Findings and Actions

1. **Cryptic Relatedness**: Families of 9 were introduced to create a confounding effect that principal components cannot resolve. This was implemented to ensure that the relatedness variance remains even after PC adjustment.

2. **Differential Missingness**: A new confounder was introduced where missingness in genotypes depends on both genotype and case status. This was tuned to ensure the call rate remains above the floor while showing significant differential missingness.

3. **Fairness and Verification**: The fairness of the task was ensured by pre-registering the kinship estimator and tie-break rules. The solution explanation and instruction documents were updated to reflect these changes.

4. **Testing and Validation**: The new task was validated through a series of tests, including the independent reference implementation and naive baselines. All tests passed, confirming the correctness of the new design.

5. **Calibration Blocker**: The calibration process was blocked due to an exhausted Portkey API key. This requires the user to complete the `stb login` process to refresh the key and resume calibration.

### Next Steps

- **Refresh Portkey API Key**: The user needs to run `stb login` and `stb keys refresh` to obtain a new API key and resume the calibration process.
- **Re-run Calibration**: Once the API key is refreshed, the calibration process will be resumed to determine the new solve rate for the hardened task.
- **Finalize Documentation**: The solution explanation and instruction documents will be finalized to reflect the new design and ensure clarity for future reference.

### Conclusion

The task has been successfully modified to increase its difficulty, and the new design has been validated through rigorous testing. The next step is to resolve the API key issue and complete the calibration to determine the new solve rate. This will provide a more accurate measure of the task's difficulty and ensure it meets the intended standards.