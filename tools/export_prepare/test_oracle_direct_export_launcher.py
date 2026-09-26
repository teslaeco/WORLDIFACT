"""Source-only checks for the synchronous/resumable Oracle export launcher."""
import unittest
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import oracle_direct_export_fix as launcher

class OracleDirectExportLauncherTests(unittest.TestCase):
    def test_package_is_exact_and_maintenance_stays_no_ai(self):
        package=launcher.package()
        self.assertEqual(set(package),set(launcher.FILES))
        self.assertIn("run_installer",launcher.REMOTE)
        self.assertIn("install_direct_v33_export_v3.py",launcher.REMOTE)
        self.assertIn("capture_output=True",launcher.REMOTE)
        self.assertIn("INVALID_INSTALLER_OUTPUT",launcher.REMOTE)
        self.assertNotIn("systemd-run",launcher.REMOTE)
        # The launcher may stage the explicit E2E verifier, but maintenance apply
        # itself invokes only the installer and never a generation endpoint.
        apply_section=launcher.REMOTE.split("def run_installer():",1)[1].split("def e2e_status():",1)[0]
        self.assertNotIn("/v1/jobs",apply_section)
        self.assertNotIn("openai",apply_section.lower())

    def test_ssh_keeps_host_verification_and_fixed_target(self):
        command=launcher.ssh_command(Path("/tmp/private-key"))
        self.assertIn("StrictHostKeyChecking=yes",command)
        self.assertIn("BatchMode=yes",command)
        self.assertIn("opc@141.148.242.30",command)
        self.assertNotIn("StrictHostKeyChecking=no",command)

if __name__=="__main__":unittest.main()
