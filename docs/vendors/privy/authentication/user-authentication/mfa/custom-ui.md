# Using custom UIs

<Tip>
  **By default, Privy's wallet MFA feature will use Privy's UIs** for enrolling users in MFA, managing MFA methods, and having users complete MFA to authorize signatures and transactions for the embedded wallet.

  This section is intended only for apps that would like to use wallet MFA with their own custom UIs, instead of Privy's defaults.
</Tip>

<Warning>
  Implementing wallet MFA with custom UIs is *substantially* more involved than integrating Privy's
  out-of-the-box wallet MFA feature. Make sure to consider the development trade-offs of using
  custom UIs over Privy defaults before finalizing on your approach!
</Warning>

<Tabs>
  <Tab title="React">
    ### Configuring MFA to be used with custom UIs

    If you plan to use your own custom UIs for wallet MFA, **set the `mfa.noPromptOnMfaRequired` field to true in the Privy provider**.

    ```tsx  theme={"system"}
    function MyApp({Component, pageProps}: AppProps) {
      return (
        <>
          <PrivyProvider
            appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}
            config={{
              mfa: {
                // Defaults to 'false'
                noPromptOnMfaRequired: true,
              },
              ...insertTheRestOfYourConfig,
            }}
          >
            <Component {...pageProps} />
          </PrivyProvider>
        </>
      );
    }
    ```

    This will configure Privy to not show its default UIs for wallet MFA, and instead rely on your custom implementation.

    ### Enrolling in MFA

    To enroll your users in MFA, use the  hook from Privy. Currently, users can enroll in three MFA methods:

    * **SMS**, where users authenticate with a 6-digit MFA code sent to their phone number
    * **TOTP**, where users authenticate with a 6-digit MFA code from an authentication app, like Authy or Google Authenticator
    * **Passkey**, where users verify with a previously registered passkey, generally through biometric authentication on their device

    #### SMS

    To enroll your users in MFA with SMS, use the  and  methods returned by the  hook:

    ```tsx  theme={"system"}
    const {initEnrollmentWithSms, submitEnrollmentWithSms} = useMfaEnrollment();
    ```

    First, initiate enrollment by prompting your user to enter the phone number they'd like to use for MFA. Then, call Privy's  method. As a parameter to this , pass a JSON object with a  field that contains the user's provide phone number as a string.

    ```tsx  theme={"system"}
    // Prompt the user for their phone number
    const phoneNumberInput = 'insert-phone-number-from-user';
    // Send an enrollment code to their phone number
    await initEnrollmentWithSms({phoneNumber: phoneNumberInput});
    ```

    Once  is called with a valid , Privy will then send a 6-digit MFA enrollment code to the provided number. This method returns a `Promise` that will resolve to `void` if the code was successfully sent, or will reject with an `error` if there was an error sending the code (e.g. invalid phone number).

    Next, prompt the user to enter the 6-digit code that was sent to their phone number, and use the  method to complete enrollment of that phone number. As a parameter to , you must pass a JSON object with both the original  that the user enrolled, and the  they received at that number.

    ```tsx  theme={"system"}
    // Prompt the user for the code sent to their phone number
    const mfaCodeInput = 'insert-mfa-code-received-by-user';
    await submitEnrollmentWithSms({
      phoneNumber: phoneNumberInput, // From above
      mfaCode: mfaCodeInput,
    });
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with SMS">
      The component below serves as a reference implementation for how to enroll your users in MFA with SMS!

      ```tsx Example enrolling a phone number for MFA theme={"system"}
      import {useMfaEnrollment} from '@privy-io/react-auth';

      export default function MfaEnrollmentWithSms() {
        const {initEnrollmentWithSms, submitEnrollmentWithSms} = useMfaEnrollment();

        const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
        const [mfaCode, setMfaCode] = useState<string | null>(null);
        const [pendingMfaCode, setPendingMfaCode] = useState<boolean>(false);

        // Handler for when the user enters their phone number to enroll in MFA.
        const onEnteredPhoneNumber = () => {
          await initEnrollmentWithSms({phoneNumber: phoneNumber}); // Sends an MFA code to the `phoneNumber`
          setPendingMfaCode(true);
        }

        // Handler for when the user enters the MFA code sent to their phone number.
        const onEnteredMfaCode = () => {
          await submitEnrollmentWithSms({phoneNumber: phoneNumber, mfaCode: mfaCode});
          // See the "Handling errors with code submission" section of this guide
          // for details on how to handle errors raised by `submitEnrollmentWithSms`
          setPendingMfaCode(false);
        }

        // If no MFA code has been sent yet, prompt the user for their phone number to enroll
        if (!pendingMfaCode) {
          // Input field for the user to enter the phone number they'd like to enroll for MFA
          return <>
            <input placeholder='(555) 555 5555' onChange={(event) => setPhoneNumber(event.target.value)}/>
            <button onClick={onEnteredPhoneNumber}>Enroll a Phone with MFA</button>
          </>;
        }

        // Input field for the user to enter the MFA code sent to their phone number
        return <>
          <input placeholder='123456' onChange={(event) => setMfaCode(event.target.value)}/>
          <button onClick={onEnteredMfaCode}>Submit Enrollment Code</button>
        </>;
      }
      ```
    </Accordion>

    <Info>
      If your app has enabled SMS as a possible *login* method, users will **not** be able to enroll SMS as a valid *MFA* method.

      SMS must be either be used as a login method to secure user accounts, or as an MFA method for additional security on the users' wallets.
    </Info>

    #### TOTP

    To enroll your users in MFA with TOTP, use the  and  methods returned by the  hook:

    ```tsx  theme={"system"}
    const {initEnrollmentWithTotp, submitEnrollmentWithTotp} = useMfaEnrollment();
    ```

    First, initiate enrollment by calling Privy's  method with no parameters. This method returns a `Promise` for an  and  that the user will need in order to complete enrollment.

    ```tsx  theme={"system"}
    const {authUrl, secret} = await initEnrollmentWithTotp();
    ```

    Then, to have the user enroll, you can either:

    * display the TOTP  as a QR code to the user, and prompt them to scan it with their TOTP client (commonly, a mobile app like Google Authenticator or Authy)
    * allow the user to copy the TOTP  and paste it into their TOTP client

    <Tip>
      You can directly pass in the  from above into a library like  to render the URL as a QR code to your user.
    </Tip>

    Once your user has successfully scanned the QR code, an enrollment code for Privy will appear within their TOTP client. Prompt the user to enter this code in your app, and call Privy's  method. As a parameter to , pass a JSON object with an  field that contains the MFA code from the user as a string.

    ```tsx  theme={"system"}
    const mfaCodeInput = 'insert-mfa-code-from-user-totp-app'; // Prompt the user for the code in their TOTP app
    await submitEnrollmentWithTotp({mfaCode: mfaCodeInput});
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with TOTP">
      The component below serves as a reference implementation for how to enroll your users in MFA with TOTP!

      ```tsx Example enrolling a TOTP client for MFA theme={"system"}
      import {useMfaEnrollment} from '@privy-io/react-auth';
      import QRCode from 'react-qr-code';
      import {CopyableElement} from '../components/CopyableElement';

      export default function MfaEnrollmentWithTotp() {
        const {initEnrollmentWithTotp, submitEnrollmentWithTotp} = useMfaEnrollment();
        const [totpAuthUrl, setTotpAuthUrl] = useState<string | null>(null);
        const [totpSecret, setTotpSecret] = useState<string | null>(null);
        const [mfaCode, setMfaCode] = useState<string | null>(null);

        // Handler for when the user is ready to enroll in TOTP MFA
        const onGenerateTotpUrl = async () => {
          const {authUrl, secret} = await initEnrollmentWithTotp();
          setTotpAuthUrl(authUrl);
          setTotpSecret(secret);
        }

        // Handler for when the user enters the MFA code from their TOTP client
        const onEnteredMfaCode = async () => {
          await submitEnrollmentWithTotp({mfaCode: mfaCode});
          // See the "Handling errors with code submission" section of this guide
          // for details on how to handle errors raised by `submitEnrollmentWithTotp`
        }

        return(
          <div>
            {/* QR code for the user to scan */}
            {totpAuthUrl && totpSecret ?
              {/* If TOTP values have been generated... */}
              <>
                {/* ...show the user a QR code with the `authUrl` that they can scan...  */}
                <QRCode value={totpAuthUrl} />
                {/* ...or give them the option to copy the `secret` into their TOTP client  */}
                <CopyableElement value={totpSecret} />
              </> :
              {/* Else, show a button to generate the totpAuthUrl */}
              <button onClick={() => onGenerateTotpUrl()}>Show QR Code</button>
            }
            {/* Input field for the user to enter their MFA code */}
            <p>Enter the code from your authenticator app below.</p>
            <input placeholder='123456' onChange={(event) => setMfaCode(event.target.value)}/>
            <button onClick={() => submitEnrollmentWithTotp({mfaCode: mfaCode})}>Submit Enrollment Code</button>
          </div>
        );
      }
      ```
    </Accordion>

    #### Passkey

    <Tip>
      In order to use passkeys as a MFA method, make sure a valid passkey is linked to the user. You can set this up by following the steps [here](/user-management/users/linking-accounts)!
    </Tip>

    To enroll your users in MFA with passkeys, use the  and  methods returned by the  hook:

    ```tsx  theme={"system"}
    const {initEnrollmentWithPasskey, submitEnrollmentWithPasskey} = useMfaEnrollment();
    ```

    First, initiate enrollment by calling Privy's  method with no parameters. This method returns a `Promise` that will resolve to `void` indicating success.

    ```tsx  theme={"system"}
    await initEnrollmentWithPasskey();
    ```

    Then, to have the user enroll, you must call Privy's `submitEnrollmentWithPasskey` method with a list of the user's passkey account `credentialIds`. You can find this list by querying the `user`'s `linkedAccounts` array for all accounts of `type: 'passkey'`:

    ```tsx  theme={"system"}
    const {user} = usePrivy();

    // ...

    const credentialIds = user.linkedAccounts
      .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
      .map((x) => x.credentialId);

    await submitEnrollmentWithPasskey({credentialIds});
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with passkeys">
      The component below serves as a reference implementation for how to enroll your users in MFA with passkeys!

      ```tsx Example enrolling passkeys for MFA theme={"system"}
      import {useMfaEnrollment} from '@privy-io/react-auth';

      export default function MfaEnrollmentWithPasskey() {
        const {user} = usePrivy();
        const {initEnrollmentWithPasskey, submitEnrollmentWithPasskey} = useMfaEnrollment();

        const handleEnrollmentWithPasskey = async () => {
          await initEnrollmentWithPasskey();

          const credentialIds = user.linkedAccounts
            .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
            .map((x) => x.credentialId);

          await submitEnrollmentWithPasskey({credentialIds});
        };

        return (
          <div>
            <div>Enable your passkeys for MFA</div>
            {user.linkedAccounts
              .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
              .map((account) => (
                <div key={account.id}>{account.credentialId}</div>
              ))}
            <button onClick={handleEnrollmentWithPasskey}>Enroll</button>
          </div>
        );
      }
      ```
    </Accordion>

    ### Completing MFA

    Once users have successfully enrolled in MFA with Privy, they will be required to complete MFA whenever the private key for their embedded wallet must be used. This includes signing messages and transactions, recovering the embedded wallet on new devices, exporting the wallet's private key, and setting a password on the wallet.

    **To ensure users can complete MFA when required, your app must do the following:**

    1. Set up a flow to guide the user through completing MFA when required.
    2. Register an event listener to configure Privy to invoke the flow from step (1) whenever MFA is required.

    <Tip>
      Once a user has completed MFA on a given device, they can continue to use the wallet on that device *without* needing to complete MFA for 15 minutes.

      After 15 minutes have elapsed, Privy will require that the user complete MFA again to re-authorize use of the wallet's private key.
    </Tip>

    #### Guiding the user through MFA

    To set up a flow to have the user complete MFA, use Privy's  hook.

    ```tsx  theme={"system"}
    const {init, submit, cancel} = useMfa();
    ```

    This flow has three core components:

    1. Requesting an MFA code be sent to the user's MFA method ()
    2. Submitting the MFA code provided by the user ()
    3. Cancelling an in-progress MFA flow ()

    ## Requesting an MFA challenge

    To request an MFA challenge for the current user, call the  method from the  hook, passing the user's desired MFA method (`'sms'`, `'totp'`, or `'passkey'`) as a parameter.

    ```tsx  theme={"system"}
    const selectedMfaMethod = 'sms'; // Must be 'sms', 'totp' or 'passkey'
    await init(selectedMfaMethod);
    ```

    The  method will then prepare an MFA challenge for the desired MFA method, and returns a `Promise` that resolves if the challenge was successfully created, and rejects with an error if there was an issue.

    * If the MFA method is `'sms'`, the user will receive an SMS with their MFA code at the phone number they originally enrolled.
    * If the MFA method is `'totp'`, the user will receive the MFA code within their authenticator app.
    * If the MFA method is `'passkey'`, `init` will return an object with options to pass to the native passkey system

    ## Submitting the MFA verification

    <Tabs>
      <Tab title="Submitting a user-input code (SMS/TOTP)">
        Once  has resolved successfully, prompt the user to get their MFA code from their MFA method and to enter it within your app. Then, call the  method from . As parameters to , pass the MFA method being used (`'sms'` or `'totp'`) and the MFA code that the user entered.

        ```tsx  theme={"system"}
        const mfaCode = 'insert-mfa-code-from-user';
        await submit(selectedMfaMethod, mfaCode);
        ```
      </Tab>

      <Tab title="Submitting a passkey">
        Once  has resolved successfully, prompt the user to select a passkey by calling `submit` with the options returned from the `init` method.

        ```tsx  theme={"system"}
        const options = await init('passkey');

        // Submit will trigger the system's native passkey prompt
        await submit('passkey', options);
        ```
      </Tab>
    </Tabs>

    ## Cancelling the MFA flow

    After  has been called and the corresponding  call has not yet occurred, the user may cancel their in-progress MFA flow if they wish.

    To cancel the current MFA flow, call the  method from the  hook.

    ```tsx  theme={"system"}
    cancel();
    ```

    <Accordion title="See a recommended abstraction for guiding users to complete MFA">
      To simplify the implementation, we recommend abstracting the logic above into a self-contained component that can be used whenever the user needs to complete an MFA flow.

      For instance, you might write an `MFAModal` component that allows the user to (1) select their desired method of their enrolled MFA methods, (2) request an MFA code, and (3) submit the MFA code to Privy for verification. A sample implementation is below:

      ```tsx Example modal for guiding users through the MFA flow theme={"system"}
      import Modal from 'react-modal';

      import {
        useMfaEnrollment,
        errorIndicatesMfaVerificationFailed,
        errorIndicatesMfaMaAttempts,
        errorIndicatesMfaTimeout,
        MfaMethod,
      } from '@privy-io/react-auth';

      type Props = {
        // List of available MFA methods that the user has enrolled in
        mfaMethods: MfaMethod[];
        // Boolean indicator to determine whether or not the modal should be open
        isOpen: boolean;
        // Helper function to open/close the modal */
        setIsOpen: (isOpen: boolean) => void;
      };

      export const MFAModal = ({mfaMethods, isOpen, setIsOpen}: Props) => {
        const {init, submit, cancel} = useMfa();
        // Stores the user's selected MFA method
        const [selectedMethod, setSelectedMethod] = useState<MfaMethod | null>(null);
        // Stores the user's MFA code
        const [mfaCode, setMfaCode] = useState('');
        // Stores the options for passkey MFA
        const [options, setOptions] = useState(null);
        // Stores an error message to display
        const [error, setError] = useState('');

        // Helper function to request an MFA code for a given method
        const onMfaInit = async (method: MfaMethod) => {
          const response = await init(method);
          setError('');
          setSelectedMethod(method);
          if (method === 'passkey') {
            setOptions(response);
          }
        };

        // Helper function to submit an MFA code to Privy for verification
        const onMfaSubmit = async () => {
          try {
            if (selectedMethod === 'passkey') {
              await submit(selectedMethod, options);
            } else {
              await submit(selectedMethod, mfaCode);
            }
            setSelectedMethod(null); // Clear the MFA flow once complete
            setIsOpen(false); // Close the modal
          } catch (e) {
            // Handling possible errors with MFA code submission
            if (errorIndicatesMfaVerificationFailed(e)) {
              setError('Incorrect MFA code, please try again.');
              // Allow the user to re-enter the code and call `submit` again
            } else if (errorIndicatesMfaMaxAttempts(e)) {
              setError('Maximum MFA attempts reached, please request a new code.');
              setSelectedMethod(null); // Clear the MFA flow to allow the user to try again
            } else if (errorIndicatesMfaTimeout(e)) {
              setError('MFA code has expired, please request a new code.');
              setSelectedMethod(null); // Clear the MFA flow to allow the user to try again
            }
          }
        };

        // Helper function to clean up state when the user closes the modal
        const onModalClose = () => {
          cancel(); // Cancel any in-progress MFA flows
          setIsOpen(false);
        };

        return (
          <Modal isOpen={isOpen} onAfterClose={onModalClose}>
            {/* Button for the user to select an MFA method and request an MFA code */}
            {mfaMethods.map((method) => (
              <button onClick={() => onMfaInit(method)}>Choose to MFA with {method}</button>
            ))}
            {/* Input field for the user to enter their MFA code and submit it */}
            {selectedMethod && selectedMethod !== 'passkey' && (
              <div>
                <p>Enter your MFA code below</p>
                <input placeholder="123456" onChange={(event) => setMfaCode(event.target.value)} />
                <button onClick={() => onMfaSubmit()}>Submit Code</button>
              </div>
            )}
            {/* Display error message if there is one */}
            {!!error.length && <p>{error}</p>}
          </Modal>
        );
      };
      ```

      Notice how the modal contains all logic for requesting the MFA code, submitting the MFA code, handling errors, and cancelling an in-progress MFA code.

      Then, when your app needs to prompt a user to complete MFA, they can simply display this  component and configure the  prop with the list of MFA methods that are available for the current user.
    </Accordion>

    #### Registering an event listener

    Once you've set up your app's logic for guiding a user to complete MFA, you lastly need to configure Privy to invoke this logic whenever MFA is required by the user's embedded wallet.

    To set up this configuration, use Privy's  hook. As a parameter to , you must pass a JSON object with an  callback, described below.

    ## onMfaRequired

    Privy will invoke the  callback you set whenever the user is required to complete MFA to use the embedded wallet. When this occurs, any use of the embedded wallet will be "paused" until the user has successfully completed MFA with Privy.

    In this callback, you should invoke your app's logic for guiding through completing MFA (done via the  hook, as documented above). Within this callback, you can also access an  parameter that contains a list of available MFA methods that the user has enrolled in (`'sms'` and/or `'totp'` and/or `'passkey'`).

    <Tabs>
      <Tab title="Registering an event listener">
        ```tsx MFAProvider.tsx theme={"system"}
        import {useRegisterMfaListener, MfaMethod} from '@privy-io/react-auth';

        import {MFAModal} from '../components/MFAModal';

        export const MFAProvider = ({children}: {children: React.ReactNode}) => {
          const [isMfaModalOpen, setIsMfaModelOpen] = useState(false);
          const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);

          useRegisterMfaListener({
            // Privy will invoke this whenever the user is required to complete MFA
            onMfaRequired: (methods) => {
              // Update app's state with the list of available MFA methods for the user
              setMfaMethods(methods);
              // Open MFA modal to allow user to complete MFA
              setIsMfaModalOpen(true);
            },
          });

          return (
            <div>
              {/* This `MFAModal` component includes all logic for completing the MFA flow with Privy's `useMfa` hook */}
              <MFAModal isOpen={isMfaModalOpen} setIsOpen={setIsMfaModalOpen} mfaMethods={mfaMethods} />
              {children}
            </div>
          );
        };
        ```
      </Tab>
    </Tabs>

    <Info>
      In order for Privy to invoke your app's MFA flow, the component that calls Privy's  hook **must be mounted** whenever the user's embedded wallet requires that they complete MFA.

      In kind, we recommend that you render this component near the root of your application, so that it is always rendered whenever the embedded wallet may be used.
    </Info>

    ### Handling errors with code submission

    When both enrolling in and completing MFA, Privy sends a 6-digit code to the user's selected MFA method, that the user must submit to Privy in order to verify their identity.

    When submitting this MFA code, Privy may respond with an error if the code is incorrect, if the user has reached the maximum number of attempts for this MFA flow, or if the MFA flow has timed out. If the user enters in an incorrect code (e.g. by mistyping), the user is allowed to retry code submission up to a **maximum of four attempts.**

    **To simplify handling errors with MFA code submission, Privy provides the following helper functions to parse errors raised by the MFA code submission methods listed above.** Each of these functions accepts the raw  raised as a parameter, and returns a `Boolean` indicating if the error meets a certain condition:

    * : indicates the user entered an incorrect MFA code
    * indicates has reached the maximum number of attempts for this MFA flow, and that a new MFA code must be requested via
    * indicates that the current MFA code has expired, and that a new MFA code must be requested via

    As an example, to handle errors raised by , you might use these helpers like so:

    ```tsx Handling errors during MFA code submission theme={"system"}
    try {
      // Errors from `submitEnrollmentWithSms` and `submitEnrollmentWithTotp` can be handled similarly
      await submit('insert-mfa-code', 'insert-mfa-method');
    } catch (e) {
      if (errorIndicatesMfaVerificationFailed(e)) {
        console.error('Incorrect MFA code, please try again.');
        // Allow the user to re-enter the code and call `submit` again
      } else if (errorIndicatesMfaMaxAttempts(e)) {
        console.error('Maximum MFA attempts reached, please request a new code.');
        // Allow the user to request a new code with `init`
      } else if (errorIndicatesMfaTimeout(e)) {
        console.error('MFA code has expired, please request a new code.');
        // Allow the user to request a new code with `init`
      }
    }
    ```
  </Tab>

  <Tab title="React Native">
    ### Enrollment flows with custom UIs in Expo

    To enroll your users in MFA, use the  and  methods returned by the  hook:

    ```tsx  theme={"system"}
    const {initMfaEnrollment, submitMfaEnrollment} = useMfaEnrollment();
    ```

    Currently, users can enroll in three MFA methods:

    * , where users authenticate with a 6-digit MFA code sent to their phone number
    * , where users authenticate with a 6-digit MFA code from an authentication app, like Authy or Google Authenticator
    * , where users verify with a previously registered passkey, generally through biometric authentication on their device

    #### SMS

    First, initiate enrollment by prompting your user to enter the phone number they'd like to use for MFA. Then, call Privy's  method with the appropriate parameters:

    ```tsx  theme={"system"}
    // Prompt the user for their phone number
    const phoneNumberInput = 'insert-phone-number-from-user';
    // Send an enrollment code to their phone number
    await initMfaEnrollment({method: 'sms', phoneNumber: phoneNumberInput});
    ```

    Once  is called with a valid , Privy will then send a 6-digit MFA enrollment code to the provided number.

    Next, prompt the user to enter the 6-digit code that was sent to their phone number, and use the  method to complete enrollment:

    ```tsx  theme={"system"}
    // Prompt the user for the code sent to their phone number
    const mfaCodeInput = 'insert-mfa-code-received-by-user';
    await submitMfaEnrollment({
      method: 'sms',
      phoneNumber: phoneNumberInput, // From above
      code: mfaCodeInput,
    });
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with SMS">
      The component below serves as a reference implementation for how to enroll your users in MFA with SMS!

      ```tsx Example enrolling a phone number for MFA theme={"system"}
      import {useMfaEnrollment} from '@privy-io/expo';

      export default function MfaEnrollmentWithSms() {
        const {initMfaEnrollment, submitMfaEnrollment} = useMfaEnrollment();

        const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
        const [mfaCode, setMfaCode] = useState<string | null>(null);
        const [pendingMfaCode, setPendingMfaCode] = useState<boolean>(false);

        // Handler for when the user enters their phone number to enroll in MFA.
        const onEnteredPhoneNumber = () => {
          await initMfaEnrollmen({method: 'sms', phoneNumber: phoneNumber}); // Sends an MFA code to the `phoneNumber`
          setPendingMfaCode(true);
        }

        // Handler for when the user enters the MFA code sent to their phone number.
        const onEnteredMfaCode = () => {
          await submitMfaEnrollment({ method: 'sms', phoneNumber: phoneNumber, code: mfaCode});
          // See the "Handling errors with code submission" section of this guide
          // for details on how to handle errors raised by `submitEnrollmentWithSms`
          setPendingMfaCode(false);
        }

        // If no MFA code has been sent yet, prompt the user for their phone number to enroll
        if (!pendingMfaCode) {
          // Input field for the user to enter the phone number they'd like to enroll for MFA
          return (
            <YStack gap={12}>
              <Input value={mfaCode}
                onChangeText={setPhoneNumber}
                flex={1}
                keyboardType="number-pad"
              />
              <Button onPress={onEnteredPhoneNumber} flex={1}>
                <Text>Enroll a Phone with MFA</Text>
              </Button>
            </YStack>
          )
        }

        // Input field for the user to enter the MFA code sent to their phone number
        return
        <>
          <Input value={mfaCode} onChangeText={setMfaCode}/>
          <Button onPress={onEnteredMfaCode}><Text>Submit Enrollment Code</Text></Button>
        </>;
      }
      ```
    </Accordion>

    <Info>
      If your app has enabled SMS as a possible *login* method, users will **not** be able to enroll SMS as a valid *MFA* method.

      SMS can be either be used as a login method to secure user accounts, or as an MFA method for additional security on the users' wallets, but cannot be used for both.
    </Info>

    #### TOTP

    First, initiate enrollment by calling Privy's  method with a JSON parameter of :

    ```tsx  theme={"system"}
    const {authUrl} = await initMfaEnrollment({method: 'totp'});
    ```

    Then, to have the user enroll, you can display the TOTP  as a QR code to the user, and prompt them to scan it with their TOTP client.

    <Tip>
      You can directly pass in the  from above into a library like  to deep link into a TOTP application for MFA.
    </Tip>

    Once your user has successfully linked into their TOTP application, prompt the user to enter the code in your app, and call Privy's  method:

    ```tsx  theme={"system"}
    const mfaCodeInput = 'insert-mfa-code-from-user-totp-app'; // Prompt the user for the code in their TOTP app
    await submitMfaEnrollment({method: 'totp', mfaCode: mfaCodeInput});
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with TOTP">
      The component below serves as a reference implementation for how to enroll your users in MFA with TOTP!

      ```tsx Example enrolling a TOTP client for MFA theme={"system"}
      import {useMfaEnrollment} from '@privy-io/expo';

      export default function MfaEnrollmentWithTotp() {
        const {initMfaEnrollment, submitMfaEnrollment} = useMfaEnrollment();
        const [totpAuthUrl, setTotpAuthUrl] = useState<string | null>(null);
        const [mfaCode, setMfaCode] = useState<string | null>(null);

        // Handler for when the user is ready to enroll in TOTP MFA
        const onGenerateTotpUrl = async () => {
          const {authUrl} = await initMfaEnrollment({method: 'totp'});
          setTotpAuthUrl(authUrl);
        }

        // Handler for when the user enters the MFA code from their TOTP client
        const onMfaEnrollmentSubmit = async () => {
          await submitMfaEnrollment({method: 'totp', code: mfaCode});
          // See the "Handling errors with code submission" section of this guide
          // for details on how to handle errors raised by `submitEnrollmentWithTotp`
        }

        return(
            {/* QR code for the user to scan */}
            <YStack gap={12}>
                    <Text>TOTP MFA Enrollment</Text>
                    {
                      // Check to see if the totpUrl is generated
                      !!totpUrl && <Text onPress={() => Linking.openURL(totpUrl)} >{totpUrl}</Text>
                      <XStack gap={12}>
                        <Input
                          value={totpCode}
                          onChangeText={setTotpCode}
                          flex={1}
                          keyboardType="number-pad"
                        />
                        {// Once the TOTP code is received in the authenticator app and input above, submit for enrollment}
                        <Button onPress={onMfaEnrollmentSubmit} flex={1}>
                          <Text>Verify OTP</Text>
                        </Button>
                      </XStack>
                    }
                  </YStack>
        );
      }
      ```
    </Accordion>

    #### Passkey

    <Tip>
      In order to use passkeys as a MFA method, make sure a valid passkey is linked to the user. You can set this up by following the steps [here](/user-management/users/linking-accounts)!
    </Tip>

    First, initiate enrollment by calling Privy's  method with a JSON parameter of :

    ```tsx  theme={"system"}
    await initMfaEnrollment({method: 'passkey'});
    ```

    Then, to have the user enroll, you must call Privy's `submitMfaEnrollment` method with a list of the user's passkey account `credentialIds`:

    ```tsx  theme={"system"}
    const {user} = usePrivy();

    // ...

    const credentialIds = user.linked_accounts
      .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
      .map((x) => x.credentialId);

    await submitMfaEnrollment({method: 'passkey', credentialIds});
    ```

    <Accordion title="See an end-to-end example of enrolling users in MFA with passkeys">
      The component below serves as a reference implementation for how to enroll your users in MFA with passkeys!

      ```tsx Example enrolling passkeys for MFA theme={"system"}
      import {useMfaEnrollment, usePrivy} from '@privy-io/expo';

      export default function MfaEnrollmentWithPasskey() {
        const {user} = usePrivy();
        const {iniMfaEnrollment, submitMfaEnrollment} = useMfaEnrollment();

        const handleEnrollmentWithPasskey = async () => {
          await initMfaEnrollment({method: 'passkey'});

          const credentialIds = user.linked_accounts
            .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
            .map((x) => x.credentialId);

          await submitMfaEnrollment({method: 'passkey', credentialIds});
        };

        return (
          <YStack>
            <Text>Enable your passkeys for MFA</Text>
            {user.linkedAccounts
              .filter((account): account is PasskeyWithMetadata => account.type === 'passkey')
              .map((account) => (
                <Text >ID: {account.id} {' '} Credential ID: {account.credentialId}</div>
              ))}
            {// Initialize and submit the passkey credentials for MFA enrollment in one step }
            <Button onPress={handleEnrollmentWithPasskey}>
              <Text>Enroll</Text>
            </Button>
          </YStack>
        );
      }
      ```
    </Accordion>

    ### Completing MFA with custom UIs in Expo

    To set up a flow to have the user complete MFA, use Privy's  hook:

    ```tsx  theme={"system"}
    const {init, submit, cancel} = useMfa();
    ```

    This flow has three core components:

    1. Requesting an MFA code be sent to the user's MFA method ()
    2. Submitting the MFA code provided by the user ()
    3. Cancelling an in-progress MFA flow ()

    #### Requesting and submitting an MFA challenge

    <Tabs>
      <Tab title="Submitting a user-input code (SMS/TOTP)">
        To request an MFA challenge and then submit the code:

        ```tsx  theme={"system"}
        const selectedMfaMethod = 'sms'; // Must be 'sms', 'totp' or 'passkey'
        await init({method: selectedMfaMethod});

        // After user enters the code
        const mfaCode = 'insert-mfa-code-from-user';
        await submit({method: selectedMfaMethod, mfaCode});
        ```
      </Tab>

      <Tab title="Submitting a passkey">
        For passkey verification:

        ```tsx  theme={"system"}
        const options = await init({method: 'passkey'});

        // Submit will trigger the system's native passkey prompt
        await submit({method: 'passkey', mfaCode: options});
        ```
      </Tab>
    </Tabs>

    When invoked,  returns a `Promise` that resolves to `void` if the user has successfully completed MFA, or rejects with an error if there was an issue completing MFA.

    #### Cancelling the MFA flow

    To cancel the current MFA flow, call the  method from the  hook:

    ```tsx  theme={"system"}
    cancel();
    ```

    <Accordion title="See a recommended abstraction for guiding users to complete MFA">
      To simplify the implementation, we recommend abstracting the logic into a self-contained component. For example:

      ```tsx Example modal for guiding users through the MFA flow theme={"system"}
      import Modal from 'react-native';

      import {
        errorIndicatesMfaVerificationFailed,
        errorIndicatesMfaMaAttempts,
        errorIndicatesMfaTimeout,
        MfaMethod,
      } from '@privy-io/expo';

      type Props = {
        // List of available MFA methods that the user has enrolled in
        mfaMethods: MfaMethod[];
        // Boolean indicator to determine whether or not the modal should be open
        isOpen: boolean;
        // Helper function to open/close the modal */
        setIsOpen: (isOpen: boolean) => void;
      };

      export const MFAModal = ({mfaMethods, isOpen, setIsOpen}: Props) => {
        const {init, submit, cancel} = useMfa();
        const [selectedMethod, setSelectedMethod] = useState<MfaMethod | null>(null);
        const [mfaCode, setMfaCode] = useState('');
        const [options, setOptions] = useState(null);
        const [error, setError] = useState('');

        const onMfaInit = async (method: MfaMethod) => {
          const response = await init({method});
          setError('');
          setSelectedMethod(method);
          if (method === 'passkey') {
            setOptions(response);
          }
        };

        const onMfaSubmit = async () => {
          try {
            if (selectedMethod === 'passkey') {
              await submit({method: selectedMethod, mfaCode: options});
            } else {
              await submit({method: selectedMethod, mfaCode});
            }
            setSelectedMethod(null);
            setIsOpen(false);
          } catch (e) {
            if (errorIndicatesMfaVerificationFailed(e)) {
              setError('Incorrect MFA code, please try again.');
            } else if (errorIndicatesMfaMaxAttempts(e)) {
              setError('Maximum MFA attempts reached, please request a new code.');
              setSelectedMethod(null);
            } else if (errorIndicatesMfaTimeout(e)) {
              setError('MFA code has expired, please request a new code.');
              setSelectedMethod(null);
            }
          }
        };

        const onModalClose = () => {
          cancel();
          setIsOpen(false);
        };

        return (
          <Modal visible={isOpen} animationType="slide" onRequestClose={onModalClose}>
            <View style={{padding: 20}}>
              {mfaMethods.map((method) => (
                <Button
                  key={method}
                  title={`Choose to MFA with ${method}`}
                  onPress={() => onMfaInit(method)}
                />
              ))}

              {selectedMethod && selectedMethod !== 'passkey' && (
                <View>
                  <Text>Enter your MFA code below</Text>
                  <TextInput
                    placeholder="123456"
                    value={mfaCode}
                    onChangeText={setMfaCode}
                    keyboardType="numeric"
                    style={{borderBottomWidth: 1, marginBottom: 10}}
                  />
                  <Button title="Submit Code" onPress={onMfaSubmit} />
                </View>
              )}

              {error.length > 0 && <Text style={{color: 'red'}}>{error}</Text>}
              <Button title="Close" onPress={onModalClose} />
            </View>
          </Modal>
        );
      };
      ```
    </Accordion>

    #### Registering an event listener

    To set up this configuration, use Privy's  hook:

    ```tsx MFAProvider.tsx theme={"system"}
    import {useRegisterMfaListener, MfaMethod} from '@privy-io/expo';

    import {MFAModal} from '../components/MFAModal';

    export const MFAProvider = ({children}: {children: React.ReactNode}) => {
      const [isMfaModalOpen, setIsMfaModelOpen] = useState(false);
      const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);

      useRegisterMfaListener({
        // Privy will invoke this whenever the user is required to complete MFA
        onMfaRequired: (methods) => {
          // Update app's state with the list of available MFA methods for the user
          setMfaMethods(methods);
          // Open MFA modal to allow user to complete MFA
          setIsMfaModalOpen(true);
        },
      });

      return (
        <View>
          {/* This `MFAModal` component includes all logic for completing the MFA flow with Privy's `useMfa` hook */}
          <MFAModal isOpen={isMfaModalOpen} setIsOpen={setIsMfaModalOpen} mfaMethods={mfaMethods} />
          {children}
        </View>
      );
    };
    ```

    <Info>
      In order for Privy to invoke your app's MFA flow, the component that calls Privy's  hook **must be mounted** whenever the user's embedded wallet requires that they complete MFA.

      We recommend that you render this component near the root of your application, so that it is always rendered whenever the embedded wallet may be used.
    </Info>

    ### Managing MFA methods

    Privy also allows users to also delete MFA methods via the method returned from the  hook:

    ```tsx Example unenrolling SMS/TOTP/passkey theme={"system"}
    import {useMfaEnrollment} from '@privy-io/expo';

    export default function MfaUnenrollment() {
      const {unenrollMfa} = useMfaEnrollment();

      return (
        <YStack>
          <Button onClick={() => unenrollMfa({method: 'sms'})}>
            <Text>Unenroll SMS</Text>
          </Button>
          <Button onClick={() => unenrollMfa({method: 'totp'})}>
            <Text>Unenroll TOTP</Text>
          </Button>
          <Button onClick={() => unenrollMfa({method: 'passkey'})}>
            <Text>Unenroll passkey</Text>
          </Button>
        </YStack>
      );
    }
    ```

    <Info>
      By default, unenrolling a passkey will also unlink it as a valid login method. In order to modify this behavior, you can set the `removeForLogin` option to `false` on the `unenrollMfa` call:

      ```tsx  theme={"system"}
      <Button onClick={() => unenrollMfa({method: 'passkey', removeForLogin: false})}>
        <Text>Unenroll passkey, keep as login method</Text>
      </Button>
      ```
    </Info>
  </Tab>
</Tabs>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.privy.io/llms.txt\n