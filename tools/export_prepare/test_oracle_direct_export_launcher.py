"""Source-only checks for the disconnect-safe Oracle export launcher."""
import unittest
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import oracle_direct_export_fix as launcher

class OracleDirectExportLauncherTests(unittest.TestCase):
    def test_package_is_exact_and_no_ai(self):
        package=launcher.package()
        self.assertEqual(set(package),set(launcher.FILES))
        self.assertIn("systemd-run",launcher.REMOTE)
        self.assertIn("result.json",launcher.REMOTE)
        self.assertIn("INSTALLATION_RUNNING",launcher.REMOTE)
        self.assertIn("paidGenerationRequested",launcher.REMOTE)
        self.assertNotIn("/v1/jobs",launcher.REMOTE)
        self.assertNotIn("openai",launcher.REMOTE.lower())

    def test_ssh_keeps_host_verification_and_fixed_target(self):
        command=launcher.ssh_command(Path("/tmp/private-key"))
        self.assertIn("StrictHostKeyChecking=yes",command)
        self.assertIn("BatchMode=yes",command)
        self.assertIn("opc@141.148.242.30",command)
        self.assertNotIn("StrictHostKeyChecking=no",command)

if __name__=="__main__":unittest.main()
